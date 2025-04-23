const nodeFetch = require('node-fetch');
require('dotenv').config();

// OpenRouterの設定
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_DAILY_MODEL = process.env.OPENROUTER_DAILY_MODEL || 'deepseek/deepseek-chat-v3-0324:free';
const OPENROUTER_CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'google/gemma-3-4b-it:free';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

if (!OPENROUTER_API_KEY) {
  console.warn('警告: OPENROUTER_API_KEYが設定されていません。');
}

/**
 * OpenRouter APIを呼び出す共通関数
 * @param {Array} messages - メッセージの配列 [{role: 'system|user|assistant', content: 'メッセージ内容'}]
 * @param {Object} options - 生成オプション
 * @param {string} options.model - 使用するモデル名
 * @returns {Promise<string>} - 生成されたテキスト
 */
async function callOpenRouter(messages, options = {}) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API キーが設定されていません。');
  }

  const defaultOptions = {
    temperature: 0.7,
    maxTokens: 2000,
    model: OPENROUTER_DAILY_MODEL
  };

  const settings = { ...defaultOptions, ...options };

  try {
    const response = await nodeFetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://assistant-discord-bot',
        'X-Title': 'Discord Assistant Bot',
      },
      body: JSON.stringify({
        model: settings.model,
        messages: messages,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API エラー: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenRouter API 呼び出しエラー:', error);
    throw error;
  }
}

/**
 * OpenRouterを使用してユーザーのメッセージに応答する
 * @param {string} userMessage - ユーザーからのメッセージ
 * @param {Array} context - コンテキスト情報（過去のメッセージ履歴など）
 * @returns {Promise<string>} - AIの応答
 */
async function respondToMessage(userMessage, context = []) {
  // コンテキストを含むプロンプトを構築
  let systemPrompt = 'あなたは秘書AIです。以下の会話履歴を踏まえて、最後のメッセージに日本語で簡潔に応答してください。';
  
  // メッセージ履歴の形成
  const messages = [
    { role: 'system', content: systemPrompt },
  ];
  
  // コンテキストを追加
  if (context.length > 0) {
    context.forEach(msg => {
      messages.push({
        role: 'user', 
        content: msg.message_content
      });
      // AIの応答はない場合があるので、そのままスキップ
    });
  }
  
  // 最新のメッセージを追加
  messages.push({ role: 'user', content: userMessage });
  
  try {
    return await callOpenRouter(messages, {
      model: OPENROUTER_CHAT_MODEL,
      temperature: 0.7,
      maxTokens: 1500
    });
  } catch (error) {
    console.error('メッセージ応答生成中にエラーが発生しました:', error);
    return 'すみません、応答の生成中にエラーが発生しました。後でもう一度お試しください。';
  }
}

/**
 * タスク解析関数: メッセージからタスクを抽出する
 * @param {string} message - 解析するメッセージ
 * @returns {Promise<Array>} - 抽出されたタスクの配列
 */
async function extractTasks(message) {
  const systemPrompt = `あなたはメッセージからタスクを抽出する秘書AIです。JSONフォーマットで結果を返してください。`;
  
  const userPrompt = `
以下のメッセージからタスクを抽出してください。各タスクについて、タイトル、説明（存在する場合）、締切日（存在する場合）を特定してください。

メッセージ:
${message}

出力フォーマット:
{
  "tasks": [
    {
      "title": "タスクのタイトル",
      "description": "タスクの詳細説明（ある場合）",
      "dueDate": "YYYY-MM-DD形式の締切日（ある場合、なければnull）"
    }
  ]
}
`;

  try {
    const response = await callOpenRouter([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      model: OPENROUTER_DAILY_MODEL,
      temperature: 0.3
    });
    
    // JSON文字列を抽出
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { tasks: [] };
    }
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('タスク抽出中にエラーが発生しました:', error);
    return { tasks: [] };
  }
}

/**
 * ジャーナリング支援関数: ユーザーのジャーナリングを手伝う
 * @param {string} message - ユーザーのメッセージ
 * @returns {Promise<Object>} - 生成されたジャーナル内容
 */
async function assistWithJournaling(message) {
  const systemPrompt = `あなたはジャーナリングを支援する秘書AIです。JSONフォーマットで結果を返してください。`;
  
  const userPrompt = `
ユーザーのメッセージを分析し、以下を含むジャーナルエントリを作成または拡張してください。
- 内容: ユーザーのアイデアや思考を整理した文章
- 感情/気分: ユーザーの感情状態の推測
- タグ: 関連するキーワード（カンマ区切り）

ユーザーのメッセージ:
${message}

出力フォーマット:
{
  "journalEntry": {
    "content": "整理されたジャーナル内容",
    "mood": "感情/気分",
    "tags": "キーワード1,キーワード2,キーワード3"
  }
}
`;

  try {
    const response = await callOpenRouter([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      model: OPENROUTER_DAILY_MODEL,
      temperature: 0.7
    });
    
    // JSON文字列を抽出
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { journalEntry: { content: message, mood: "不明", tags: "" } };
    }
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('ジャーナリング支援中にエラーが発生しました:', error);
    return { journalEntry: { content: message, mood: "不明", tags: "" } };
  }
}

/**
 * 日次サマリー生成関数: ユーザーの最近のメッセージからサマリーを生成する
 * @param {Array} messageHistory - ユーザーのメッセージ履歴
 * @param {Array} tasks - ユーザーのタスク一覧
 * @returns {Promise<string>} - 生成されたサマリー
 */
async function generateDailySummary(messageHistory, tasks) {
  // 最近のメッセージからコンテキストを構築
  let context = messageHistory
    .map(msg => msg.message_content)
    .join('\n\n');
  
  // タスクの情報を文字列化
  let taskContext = '';
  if (tasks && tasks.length > 0) {
    taskContext = '現在のタスク:\n' + tasks
      .map(task => `- ${task.title}${task.due_date ? `（期限: ${task.due_date}）` : ''}${task.status ? `（状態: ${task.status}）` : ''}`)
      .join('\n');
  }
  
  const systemPrompt = `
あなたは高度な秘書AIです。ユーザーの最近のメッセージや現在のタスクに基づいて、以下を含む日次サマリーを作成してください：
1. 主なトピックやテーマの概要
2. 進捗状況の分析
3. 今日の優先タスク
4. 明日に向けての提案

必ず日本語で回答してください。
`;

  const userPrompt = `
以下はユーザーの最近のメッセージと現在のタスクリストです：

ユーザーのメッセージ履歴:
${context}

${taskContext}

日付: ${new Date().toLocaleDateString('ja-JP')}

上記の情報に基づいて、日次サマリーを作成してください。
`;

  try {
    return await callOpenRouter([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      model: OPENROUTER_DAILY_MODEL,
      temperature: 0.8,
      maxTokens: 3000
    });
  } catch (error) {
    console.error('日次サマリー生成中にエラーが発生しました:', error);
    return '日次サマリーの生成中にエラーが発生しました。';
  }
}

module.exports = {
  respondToMessage,
  extractTasks,
  assistWithJournaling,
  generateDailySummary
};