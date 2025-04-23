const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Gemini API キーを環境変数から取得
const apiKey = process.env.GEMINI_API_KEY;

// API キーがない場合はエラーをスローする
if (!apiKey) {
  console.warn('警告: GEMINI_API_KEYが設定されていません。');
}

// GoogleGenerativeAI クライアントを初期化
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const modelName = 'gemini-1.5-pro'; // 最新のGeminiモデル

/**
 * Gemini APIを使用してテキスト生成を行う関数
 * @param {string} prompt - プロンプト文字列
 * @param {Object} options - 生成オプション
 * @returns {Promise<string>} - 生成されたテキスト
 */
async function generateGeminiResponse(prompt, options = {}) {
  if (!genAI) {
    throw new Error('Gemini API キーが設定されていません。');
  }

  const defaultOptions = {
    temperature: 0.7,
    topK: 1,
    topP: 0.95,
    maxOutputTokens: 2048,
  };

  const settings = { ...defaultOptions, ...options };

  try {
    // モデルのインスタンスを生成
    const model = genAI.getGenerativeModel({
      model: modelName,
    });

    // 生成設定
    const generationConfig = {
      temperature: settings.temperature,
      topK: settings.topK,
      topP: settings.topP,
      maxOutputTokens: settings.maxOutputTokens,
    };

    // テキスト生成
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });

    const response = result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API エラー:', error);
    throw error;
  }
}

/**
 * タスク解析関数: メッセージからタスクを抽出する
 * @param {string} message - 解析するメッセージ
 * @returns {Promise<Array>} - 抽出されたタスクの配列
 */
async function extractTasks(message) {
  const prompt = `
以下のメッセージからタスクを抽出してください。各タスクについて、タイトル、説明（存在する場合）、締切日（存在する場合）を特定してください。
JSONフォーマットで結果を返してください。

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
    const response = await generateGeminiResponse(prompt);
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
 * プロジェクトアイデア生成関数: ユーザーの会話履歴からプロジェクトアイデアを生成する
 * @param {Array} messageHistory - ユーザーのメッセージ履歴
 * @returns {Promise<Array>} - 生成されたプロジェクトアイデアの配列
 */
async function generateProjectIdeas(messageHistory) {
  // 最近のメッセージからコンテキストを構築
  let context = messageHistory
    .map(msg => msg.message_content)
    .join('\n\n');
  
  const prompt = `
あなたは創造的な秘書AIです。ユーザーの過去のメッセージに基づいて、ユーザーが興味を持ちそうな新しいプロジェクトのアイデアを3つ提案してください。
各アイデアには、タイトル、詳細な説明、カテゴリを含めてください。

ユーザーのメッセージ履歴:
${context}

出力フォーマット:
{
  "projectIdeas": [
    {
      "title": "プロジェクトのタイトル",
      "description": "プロジェクトの詳細説明",
      "category": "プロジェクトのカテゴリ（技術、ビジネス、趣味など）"
    }
  ]
}
`;

  try {
    const response = await generateGeminiResponse(prompt);
    // JSON文字列を抽出
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { projectIdeas: [] };
    }
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('プロジェクトアイデア生成中にエラーが発生しました:', error);
    return { projectIdeas: [] };
  }
}

/**
 * ジャーナリング支援関数: ユーザーのジャーナリングを手伝う
 * @param {string} message - ユーザーのメッセージ
 * @returns {Promise<Object>} - 生成されたジャーナル内容
 */
async function assistWithJournaling(message) {
  const prompt = `
あなたはジャーナリングを支援する秘書AIです。ユーザーのメッセージを分析し、以下を含むジャーナルエントリを作成または拡張してください。
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
    const response = await generateGeminiResponse(prompt);
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
  
  const prompt = `
あなたは高度な秘書AIです。ユーザーの最近のメッセージや現在のタスクに基づいて、以下を含む日次サマリーを作成してください：
1. 主なトピックやテーマの概要
2. 進捗状況の分析
3. 今日の優先タスク
4. 明日に向けての提案

ユーザーのメッセージ履歴:
${context}

${taskContext}

日付: ${new Date().toLocaleDateString('ja-JP')}
`;

  try {
    const response = await generateGeminiResponse(prompt, {
      temperature: 0.8,
      maxOutputTokens: 3000
    });
    
    return response.trim();
  } catch (error) {
    console.error('日次サマリー生成中にエラーが発生しました:', error);
    return '日次サマリーの生成中にエラーが発生しました。';
  }
}

module.exports = {
  generateGeminiResponse,
  extractTasks,
  generateProjectIdeas,
  assistWithJournaling,
  generateDailySummary
};