const fetch = require('node-fetch');
require('dotenv').config();

// OpenRouterの設定
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_DAILY_MODEL = process.env.OPENROUTER_DAILY_MODEL || 'deepseek/deepseek-chat-v3-0324:free';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

if (!OPENROUTER_API_KEY) {
  console.warn('警告: OPENROUTER_API_KEYが設定されていません。');
}

/**
 * 日次サマリー生成関数: ユーザーの最近のメッセージからサマリーを生成する
 * @param {Array} messageHistory - ユーザーのメッセージ履歴
 * @param {Array} tasks - ユーザーのタスク一覧
 * @returns {Promise<string>} - 生成されたサマリー
 */
async function generateDailySummary(messageHistory, tasks) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API キーが設定されていません。');
  }

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
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://assistant-discord-bot',
        'X-Title': 'Discord Assistant Bot - Daily Summary',
      },
      body: JSON.stringify({
        model: OPENROUTER_DAILY_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 3000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API エラー: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error('日次サマリー生成中にエラーが発生しました:', error);
    return '日次サマリーの生成中にエラーが発生しました。';
  }
}

module.exports = {
  generateDailySummary
};
