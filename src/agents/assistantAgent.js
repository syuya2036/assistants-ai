const { LangChain, initializeAgentExecutorWithOptions } = require('langchain');
const { DynamicTool } = require('langchain/tools');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const database = require('../database');
const localLLM = require('../services/localLLM');
const geminiService = require('../services/geminiService');

/**
 * 秘書AIのエージェントを作成し、それが使用するツールを初期化する
 * @param {string} userId - ツールを使用するユーザーのID
 * @returns {Object} - LangChainエージェントインスタンス
 */
async function createAssistantAgent(userId) {
  // データベースツールの作成
  const databaseTools = [
    new DynamicTool({
      name: "get_tasks",
      description: "ユーザーのタスク一覧を取得します",
      func: async () => {
        try {
          const tasks = await database.tasks.getAll(userId);
          return JSON.stringify(tasks);
        } catch (error) {
          return `エラー: ${error.message}`;
        }
      }
    }),
    
    new DynamicTool({
      name: "add_task",
      description: "新しいタスクをユーザーのタスクリストに追加します",
      func: async (input) => {
        try {
          const { title, description, dueDate } = JSON.parse(input);
          const taskId = await database.tasks.create(userId, title, description, dueDate);
          return `タスク「${title}」を追加しました（ID: ${taskId}）`;
        } catch (error) {
          return `エラー: ${error.message}`;
        }
      }
    }),
    
    new DynamicTool({
      name: "update_task",
      description: "既存のタスクを更新します",
      func: async (input) => {
        try {
          const { taskId, updateData } = JSON.parse(input);
          const changes = await database.tasks.update(taskId, updateData);
          return `タスク（ID: ${taskId}）を更新しました`;
        } catch (error) {
          return `エラー: ${error.message}`;
        }
      }
    }),
    
    new DynamicTool({
      name: "get_project_ideas",
      description: "ユーザーのプロジェクトアイデア一覧を取得します",
      func: async () => {
        try {
          const ideas = await database.projectIdeas.getAll(userId);
          return JSON.stringify(ideas);
        } catch (error) {
          return `エラー: ${error.message}`;
        }
      }
    }),
    
    new DynamicTool({
      name: "add_project_idea",
      description: "新しいプロジェクトアイデアを追加します",
      func: async (input) => {
        try {
          const { title, description, category } = JSON.parse(input);
          const ideaId = await database.projectIdeas.create(userId, title, description, category);
          return `アイデア「${title}」を追加しました（ID: ${ideaId}）`;
        } catch (error) {
          return `エラー: ${error.message}`;
        }
      }
    }),
    
    new DynamicTool({
      name: "get_journal_entries",
      description: "ユーザーの最近のジャーナルエントリを取得します",
      func: async () => {
        try {
          const entries = await database.journal.getRecent(userId);
          return JSON.stringify(entries);
        } catch (error) {
          return `エラー: ${error.message}`;
        }
      }
    }),
    
    new DynamicTool({
      name: "add_journal_entry",
      description: "新しいジャーナルエントリを追加します",
      func: async (input) => {
        try {
          const { content, mood, tags } = JSON.parse(input);
          const entryId = await database.journal.create(userId, content, mood, tags);
          return `ジャーナルエントリを追加しました（ID: ${entryId}）`;
        } catch (error) {
          return `エラー: ${error.message}`;
        }
      }
    })
  ];
  
  // AI関連ツールの作成
  const aiTools = [
    new DynamicTool({
      name: "extract_tasks",
      description: "メッセージからタスクを抽出します",
      func: async (input) => {
        try {
          const result = await geminiService.extractTasks(input);
          if (result.tasks && Array.isArray(result.tasks)) {
            // 抽出したタスクを自動的にデータベースに保存
            for (const task of result.tasks) {
              await database.tasks.create(
                userId,
                task.title,
                task.description || "",
                task.dueDate || null
              );
            }
          }
          return JSON.stringify(result);
        } catch (error) {
          return `エラー: ${error.message}`;
        }
      }
    }),
    
    new DynamicTool({
      name: "generate_project_ideas",
      description: "ユーザーの過去のメッセージに基づいてプロジェクトのアイデアを生成します",
      func: async () => {
        try {
          // 最近のメッセージ履歴を取得
          const messageHistory = await database.getRecentMessages(userId, 50);
          const ideas = await geminiService.generateProjectIdeas(messageHistory);
          
          // 生成したアイデアをデータベースに保存
          if (ideas.projectIdeas && Array.isArray(ideas.projectIdeas)) {
            for (const idea of ideas.projectIdeas) {
              await database.projectIdeas.create(
                userId,
                idea.title,
                idea.description || "",
                idea.category || ""
              );
            }
          }
          
          return JSON.stringify(ideas);
        } catch (error) {
          return `エラー: ${error.message}`;
        }
      }
    }),
    
    new DynamicTool({
      name: "assist_with_journaling",
      description: "ユーザーのジャーナリングを支援します",
      func: async (input) => {
        try {
          const result = await geminiService.assistWithJournaling(input);
          
          // ジャーナルエントリをデータベースに保存
          if (result.journalEntry) {
            const entry = result.journalEntry;
            await database.journal.create(
              userId,
              entry.content,
              entry.mood,
              entry.tags
            );
          }
          
          return JSON.stringify(result);
        } catch (error) {
          return `エラー: ${error.message}`;
        }
      }
    }),
    
    new DynamicTool({
      name: "generate_daily_summary",
      description: "ユーザーの活動の日次サマリーを生成します",
      func: async () => {
        try {
          // 最近のメッセージと現在のタスクを取得
          const messageHistory = await database.getRecentMessages(userId, 50);
          const tasks = await database.tasks.getAll(userId);
          
          const summary = await geminiService.generateDailySummary(messageHistory, tasks);
          return summary;
        } catch (error) {
          return `エラー: ${error.message}`;
        }
      }
    })
  ];
  
  // すべてのツールを集約
  const tools = [...databaseTools, ...aiTools];
  
  // OpenAI APIのオブジェクトを作成（代わりにローカルLLMを使用）
  const llmModel = new ChatOpenAI({
    temperature: 0.7,
    modelName: "local-model",
    // ここではローカルLLMを使用するための設定を行う必要があります
    // 例: APIコールをカスタマイズするなど
  });
  
  // プロンプトとツールを使ってエージェントを初期化
  const agent = await initializeAgentExecutorWithOptions(
    tools,
    llmModel,
    {
      agentType: "chat-conversational-react-description",
      verbose: true,
      maxIterations: 5,
    }
  );
  
  return agent;
}

/**
 * エージェントを使ってユーザーの入力に応答する
 * @param {string} userId - ユーザーのID
 * @param {string} userInput - ユーザーの入力
 * @returns {Promise<string>} - AIの応答
 */
async function getAgentResponse(userId, userInput) {
  try {
    // エージェントの作成
    const agent = await createAssistantAgent(userId);
    
    // エージェントに問い合わせ
    const result = await agent.call({
      input: userInput
    });
    
    return result.output;
  } catch (error) {
    console.error('エージェント実行エラー:', error);
    return 'すみません、応答の生成中にエラーが発生しました。';
  }
}

module.exports = {
  createAssistantAgent,
  getAgentResponse
};