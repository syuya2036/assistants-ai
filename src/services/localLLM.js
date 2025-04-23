const fetch = require('node-fetch');
require('dotenv').config();

const LOCAL_LLM_API_URL = process.env.LOCAL_LLM_API_URL || 'http://localhost:1234/v1';
const LOCAL_LLM_API_KEY = process.env.LOCAL_LLM_API_KEY || '';

/**
 * ローカルLLMでテキスト生成を行う関数
 * @param {string} prompt - プロンプト文字列
 * @param {Object} options - 生成オプション
 * @param {number} options.temperature - 温度パラメータ (0.0-1.0)
 * @param {number} options.maxTokens - 最大生成トークン数
 * @returns {Promise<string>} - 生成されたテキスト
 */
async function generateText(prompt, options = {}) {
  const defaultOptions = {
    temperature: 0.7,
    maxTokens: 1000,
  };

  const settings = { ...defaultOptions, ...options };

  try {
    const response = await fetch(`${LOCAL_LLM_API_URL}/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(LOCAL_LLM_API_KEY && { 'Authorization': `Bearer ${LOCAL_LLM_API_KEY}` })
      },
      body: JSON.stringify({
        model: 'local-model', // ローカルモデル名（必要に応じて調整）
        prompt: prompt,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
      })
    });

    if (!response.ok) {
      throw new Error(`ローカルLLM API エラー: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].text;
  } catch (error) {
    console.error('ローカルLLM呼び出しエラー:', error);
    throw error;
  }
}

/**
 * ローカルLLMを使用してユーザーのメッセージに応答する
 * @param {string} userMessage - ユーザーからのメッセージ
 * @param {Array} context - コンテキスト情報（過去のメッセージ履歴など）
 * @returns {Promise<string>} - AIの応答
 */
async function respondToMessage(userMessage, context = []) {
  // コンテキストを含むプロンプトを構築
  let prompt = '';
  
  if (context.length > 0) {
    prompt += '以下は過去の会話履歴です：\n';
    context.forEach(msg => {
      prompt += `${msg.user_id}: ${msg.message_content}\n`;
    });
    prompt += '\n現在のメッセージ：\n';
  }
  
  prompt += `ユーザー: ${userMessage}\n秘書AI: `;
  
  try {
    const response = await generateText(prompt, {
      temperature: 0.7,
      maxTokens: 1500
    });
    
    return response.trim();
  } catch (error) {
    console.error('メッセージ応答生成中にエラーが発生しました:', error);
    return 'すみません、応答の生成中にエラーが発生しました。後でもう一度お試しください。';
  }
}

module.exports = {
  generateText,
  respondToMessage
};