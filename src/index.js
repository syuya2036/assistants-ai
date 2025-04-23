const { Client, Events, GatewayIntentBits, MessageActionRow, MessageButton } = require('discord.js');
const { CronJob } = require('cron');
require('dotenv').config();

const database = require('./database');
const localLLM = require('./services/localLLM');
const geminiService = require('./services/geminiService');
const assistantAgent = require('./agents/assistantAgent');
const { formatDate, extractDates, extractUniqueUserIds } = require('./utils/helpers');

// Discordクライアントの初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Botが起動したときの処理
client.once(Events.ClientReady, (readyClient) => {
  console.log(`${readyClient.user.tag} としてログインしました！`);
  setupDailyJob();
});

// メッセージの受信時の処理
client.on(Events.MessageCreate, async message => {
  // Botのメッセージは無視
  if (message.author.bot) return;
  
  // メッセージをデータベースに保存
  try {
    await database.saveMessage(
      message.author.id,
      message.channel.id,
      message.content
    );
    console.log(`メッセージをデータベースに保存: ${message.author.username}`);
  } catch (error) {
    console.error('メッセージの保存中にエラーが発生しました:', error);
  }

  // @ai メンションの処理（Gemini API呼び出し）
  if (message.content.toLowerCase().includes('@ai')) {
    // typing表示
    message.channel.sendTyping();
    
    try {
      const prompt = message.content.replace(/@ai/gi, '').trim();
      
      // Gemini APIを使用して応答を生成
      const response = await geminiService.generateGeminiResponse(
        `あなたは秘書AIです。以下の質問に日本語で答えてください：${prompt}`
      );
      
      await message.reply(response);
    } catch (error) {
      console.error('Gemini API呼び出しエラー:', error);
      await message.reply('すみません、エラーが発生しました。後でもう一度お試しください。');
    }
    
    return;
  }
  
  // タスク抽出の処理
  if (message.content.toLowerCase().includes('タスク') || 
      message.content.toLowerCase().includes('todo')) {
    try {
      const result = await geminiService.extractTasks(message.content);
      
      if (result.tasks && result.tasks.length > 0) {
        // 抽出したタスクをデータベースに保存
        for (const task of result.tasks) {
          // 日付が指定されていない場合は、メッセージから日付を抽出してみる
          const dueDate = task.dueDate || extractDates(message.content)[0] || null;
          
          await database.tasks.create(
            message.author.id, 
            task.title, 
            task.description || "", 
            dueDate
          );
        }
        
        const taskList = result.tasks.map(task => {
          const dueDateStr = task.dueDate ? ` (期限: ${task.dueDate})` : '';
          return `- ${task.title}${dueDateStr}`;
        }).join('\n');
        
        await message.reply(`以下のタスクを登録しました：\n${taskList}`);
      }
    } catch (error) {
      console.error('タスク抽出エラー:', error);
    }
  }
  
  // ジャーナリング支援の処理
  if (message.content.toLowerCase().includes('ジャーナル') ||
      message.content.toLowerCase().includes('日記')) {
    try {
      const result = await geminiService.assistWithJournaling(message.content);
      
      if (result.journalEntry) {
        const entry = result.journalEntry;
        
        // ジャーナルエントリをデータベースに保存
        await database.journal.create(
          message.author.id,
          entry.content,
          entry.mood,
          entry.tags
        );
        
        await message.reply(
          `ジャーナルエントリを保存しました。\n\n気分: ${entry.mood}\nタグ: ${entry.tags}`
        );
      }
    } catch (error) {
      console.error('ジャーナリング支援エラー:', error);
    }
  }
  
  // 通常のメッセージ処理（ローカルLLM）
  try {
    // 過去のメッセージを取得してコンテキストとして使用
    const recentMessages = await database.getRecentMessages(message.author.id, 5);
    
    // typing表示
    message.channel.sendTyping();
    
    // ローカルLLMで応答を生成
    const response = await localLLM.respondToMessage(message.content, recentMessages);
    
    // 応答が長すぎる場合は分割して送信
    if (response.length > 2000) {
      const chunks = splitMessage(response);
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    } else {
      await message.reply(response);
    }
  } catch (error) {
    console.error('ローカルLLM応答エラー:', error);
    // エラーが発生した場合はユーザーに通知しない（静かに失敗）
  }
});

// メッセージを分割する関数（Discordの文字制限対応）
function splitMessage(message, maxLength = 2000) {
  const chunks = [];
  let currentChunk = '';
  
  const paragraphs = message.split('\n\n');
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 <= maxLength) {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      if (paragraph.length <= maxLength) {
        currentChunk = paragraph;
      } else {
        // 段落が長すぎる場合、さらに分割
        const sentences = paragraph.split('. ');
        let tempChunk = '';
        
        for (const sentence of sentences) {
          if (tempChunk.length + sentence.length + 2 <= maxLength) {
            tempChunk += (tempChunk ? '. ' : '') + sentence;
          } else {
            if (tempChunk) {
              chunks.push(tempChunk + '.');
            }
            tempChunk = sentence;
          }
        }
        
        if (tempChunk) {
          currentChunk = tempChunk;
        }
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

// 日次ジョブの設定（Geminiが一日一回走る）
function setupDailyJob() {
  const cronTime = process.env.DAILY_CRON_TIME || '0 9 * * *'; // デフォルトは毎朝9時
  
  const job = new CronJob(cronTime, async function() {
    console.log(`日次サマリージョブを実行中... ${formatDate()}`);
    
    try {
      // データベースから全てのユニークなユーザーIDを取得
      const messageHistory = await database.db.all('SELECT DISTINCT user_id FROM message_history');
      const userIds = messageHistory.map(record => record.user_id);
      
      for (const userId of userIds) {
        // 最近のメッセージと現在のタスクを取得
        const messageHistory = await database.getRecentMessages(userId, 50);
        const tasks = await database.tasks.getAll(userId);
        
        // 日次サマリーを生成
        const summary = await geminiService.generateDailySummary(messageHistory, tasks);
        
        // ユーザーにDMを送信（または指定されたチャンネルに投稿）
        try {
          const userObj = await client.users.fetch(userId);
          await userObj.send(`📅 **${formatDate()} の日次サマリー** 📅\n\n${summary}`);
          console.log(`ユーザー ${userId} の日次サマリーを送信しました`);
        } catch (error) {
          console.error(`ユーザー ${userId} へのDM送信エラー:`, error);
        }
      }
    } catch (error) {
      console.error('日次サマリージョブ実行中にエラーが発生しました:', error);
    }
  });
  
  // ジョブを開始
  job.start();
  console.log(`日次サマリージョブをスケジュール設定しました: ${cronTime}`);
}

// Discordに接続
client.login(process.env.DISCORD_TOKEN)
  .catch(error => {
    console.error('Discord接続エラー:', error);
    process.exit(1);
  });

// 終了時の処理
process.on('SIGINT', async () => {
  console.log('アプリケーションを終了しています...');
  await database.close();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('アプリケーションを終了しています...');
  await database.close();
  client.destroy();
  process.exit(0);
});