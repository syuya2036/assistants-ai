const fetch = require('node-fetch');
require('dotenv').config();

// OpenRouterの設定
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'google/gemma-3-4b-it:free';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

if (!OPENROUTER_API_KEY) {
  console.warn('警告: OPENROUTER_API_KEYが設定されていません。');
}

/**
 * OpenRouterのAPIを使用してテキスト生成を行う関数
 * @param {string} prompt - プロンプト文字列
 * @param {Object} options - 生成オプション
 * @param {number} options.temperature - 温度パラメータ (0.0-1.0)
 * @param {number} options.maxTokens - 最大生成トークン数
 * @returns {Promise<string>} - 生成されたテキスト
 */
async function generateText(prompt, options = {}) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API キーが設定されていません。');
  }

  const defaultOptions = {
    temperature: 0.7,
    maxTokens: 1000,
  };

  const settings = { ...defaultOptions, ...options };

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://assistant-discord-bot', // 必要に応じて変更
        'X-Title': 'Discord Assistant Bot',  // 必要に応じて変更
      },
      body: JSON.stringify({
        model: OPENROUTER_CHAT_MODEL,
        messages: [
          { role: 'system', content: 'あなたは秘書AIです。日本語で短く明確に回答してください。' },
          { role: 'user', content: prompt }
        ],
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API エラー: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
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
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://assistant-discord-bot', // 必要に応じて変更
        'X-Title': 'Discord Assistant Bot',  // 必要に応じて変更
      },
      body: JSON.stringify({
        model: OPENROUTER_CHAT_MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API エラー: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('メッセージ応答生成中にエラーが発生しました:', error);
    return 'すみません、応答の生成中にエラーが発生しました。後でもう一度お試しください。';
  }
}

module.exports = {
  generateText,
  respondToMessage
};
