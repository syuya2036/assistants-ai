/**
 * 日付をフォーマットする関数
 * @param {Date} date - フォーマットする日付
 * @param {string} format - 日付フォーマット ('ja' または 'iso')
 * @returns {string} - フォーマットされた日付文字列
 */
function formatDate(date = new Date(), format = 'ja') {
  if (format === 'iso') {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  } else if (format === 'ja') {
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }); // 例: 2025年4月23日(水)
  }
  return date.toDateString();
}

/**
 * テキストから重要なキーワードを抽出する関数
 * @param {string} text - 解析するテキスト
 * @returns {Array<string>} - 抽出されたキーワードの配列
 */
function extractKeywords(text) {
  // 簡易的なキーワード抽出
  const words = text.toLowerCase().split(/\s+/);
  const stopWords = ['は', 'が', 'の', 'を', 'に', 'で', 'と', 'た', 'し', 'です', 'ます', 'から', 'など', 'それ'];
  
  // ストップワードを除去して、長さが2文字以上の単語だけを残す
  return words
    .filter(word => word.length >= 2 && !stopWords.includes(word))
    .slice(0, 10); // 最大10個のキーワードを返す
}

/**
 * テキストから日付を抽出する関数
 * @param {string} text - 解析するテキスト
 * @returns {Array<string>} - YYYY-MM-DD形式の日付の配列
 */
function extractDates(text) {
  const dates = [];
  
  // 日付パターンを検出
  // 1. YYYY-MM-DD または YYYY/MM/DD
  const isoPattern = /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/g;
  let match;
  
  while ((match = isoPattern.exec(text)) !== null) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    const day = parseInt(match[3]);
    
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      dates.push(formattedDate);
    }
  }
  
  // 2. 日本語形式 (YYYY年MM月DD日)
  const jaPattern = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/g;
  
  while ((match = jaPattern.exec(text)) !== null) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    const day = parseInt(match[3]);
    
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      dates.push(formattedDate);
    }
  }
  
  // 3. 相対日付 (今日, 明日, 明後日)
  if (text.includes('今日')) {
    const today = new Date();
    dates.push(formatDate(today, 'iso'));
  }
  
  if (text.includes('明日')) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dates.push(formatDate(tomorrow, 'iso'));
  }
  
  if (text.includes('明後日')) {
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    dates.push(formatDate(dayAfterTomorrow, 'iso'));
  }
  
  return [...new Set(dates)]; // 重複を削除
}

/**
 * 感情分析のための簡易的な関数
 * @param {string} text - 解析するテキスト
 * @returns {string} - 推定された感情 ('positive', 'neutral', 'negative')
 */
function analyzeSimpleMood(text) {
  const positiveWords = ['嬉しい', '楽しい', 'ありがとう', '感謝', '好き', '良い', 'うれしい', '素晴らしい', '幸せ', '成功'];
  const negativeWords = ['悲しい', '辛い', '嫌い', '残念', '失敗', 'だめ', '最悪', '不安', '怒り', 'つらい'];
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  positiveWords.forEach(word => {
    if (text.includes(word)) {
      positiveCount++;
    }
  });
  
  negativeWords.forEach(word => {
    if (text.includes(word)) {
      negativeCount++;
    }
  });
  
  if (positiveCount > negativeCount) {
    return 'positive';
  } else if (negativeCount > positiveCount) {
    return 'negative';
  } else {
    return 'neutral';
  }
}

/**
 * 文字列を指定された長さに切り詰める
 * @param {string} text - 入力テキスト
 * @param {number} length - 最大長さ
 * @returns {string} - 切り詰めたテキスト
 */
function truncateText(text, length = 100) {
  if (text.length <= length) {
    return text;
  }
  return text.substring(0, length - 3) + '...';
}

/**
 * オブジェクトの配列から一意のユーザーIDのリストを抽出
 * @param {Array<Object>} messageHistory - メッセージ履歴オブジェクトの配列
 * @returns {Array<string>} - 一意のユーザーIDの配列
 */
function extractUniqueUserIds(messageHistory) {
  return [...new Set(messageHistory.map(msg => msg.user_id))];
}

module.exports = {
  formatDate,
  extractKeywords,
  extractDates,
  analyzeSimpleMood,
  truncateText,
  extractUniqueUserIds
};