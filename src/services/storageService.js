// Сервис для работы с IndexedDB (локальное хранилище)
export class StorageService {
  constructor() {
    this.dbName = 'EnglishMasterDB';
    this.dbVersion = 1;
    this.db = null;
  }

  // Инициализация базы данных
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Хранилище прогресса пользователя
        if (!db.objectStoreNames.contains('userProgress')) {
          const userStore = db.createObjectStore('userProgress', { keyPath: 'id' });
          userStore.createIndex('type', 'type', { unique: false });
        }

        // Хранилище выученных слов (SRS)
        if (!db.objectStoreNames.contains('wordsProgress')) {
          const wordsStore = db.createObjectStore('wordsProgress', { keyPath: 'wordId' });
          wordsStore.createIndex('nextReview', 'nextReview', { unique: false });
          wordsStore.createIndex('level', 'level', { unique: false });
        }

        // Хранилище достижений
        if (!db.objectStoreNames.contains('achievements')) {
          const achStore = db.createObjectStore('achievements', { keyPath: 'id' });
          achStore.createIndex('unlocked', 'unlocked', { unique: false });
        }

        // Хранилище настроек
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Хранилище истории диалогов с AI
        if (!db.objectStoreNames.contains('chatHistory')) {
          const chatStore = db.createObjectStore('chatHistory', { keyPath: 'id', autoIncrement: true });
          chatStore.createIndex('lessonId', 'lessonId', { unique: false });
          chatStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // Общие методы для работы с хранилищем
  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async set(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Методы для прогресса пользователя
  async getUserProgress(userId = 'default') {
    const progress = await this.get('userProgress', userId);
    if (!progress) {
      return this.createDefaultProgress(userId);
    }
    return progress;
  }

  createDefaultProgress(userId) {
    return {
      id: userId,
      xp: 0,
      level: 1,
      streak: 0,
      lastStudyDate: null,
      totalStudyTime: 0,
      lessonsCompleted: [],
      wordsLearned: 0,
      correctStreak: 0,
      maxCorrectStreak: 0,
      aiConversations: 0,
      aiChatMinutes: 0,
      essaysWritten: 0,
      listeningExercises: 0,
      gamesPlayed: 0,
      achievements: []
    };
  }

  async saveUserProgress(progress) {
    return await this.set('userProgress', progress);
  }

  async addXP(amount) {
    const progress = await this.getUserProgress();
    progress.xp += amount;
    
    // Проверка повышения уровня
    const levels = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500];
    const newLevel = levels.findIndex((xp, i) => 
      progress.xp < (levels[i + 1] || Infinity)
    ) + 1;
    
    if (newLevel > progress.level) {
      progress.level = newLevel;
      return { leveledUp: true, newLevel };
    }
    
    await this.saveUserProgress(progress);
    return { leveledUp: false };
  }

  // Методы для SRS (слов)
  async getWordsForReview() {
    const allWords = await this.getAll('wordsProgress');
    const now = Date.now();
    
    return allWords.filter(word => word.nextReview <= now);
  }

  async updateWordProgress(wordId, data) {
    const existing = await this.get('wordsProgress', wordId);
    
    const progress = {
      wordId,
      level: existing ? existing.level + 1 : 1,
      correctCount: existing ? existing.correctCount + 1 : 1,
      incorrectCount: existing ? existing.incorrectCount : 0,
      lastReviewed: Date.now(),
      nextReview: this.calculateNextReview(data.interval || 1),
      ...data
    };
    
    await this.set('wordsProgress', progress);
  }

  async markWordIncorrect(wordId) {
    const existing = await this.get('wordsProgress', wordId);
    if (existing) {
      existing.level = Math.max(0, existing.level - 1);
      existing.incorrectCount++;
      existing.nextReview = Date.now() + 60000; // Через 1 минуту
      await this.set('wordsProgress', existing);
    }
  }

  calculateNextReview(days) {
    // Интервалы по системе Leitner: 1, 3, 7, 14, 30 дней
    const intervals = [1, 3, 7, 14, 30, 60, 90];
    const interval = intervals[Math.min(days - 1, intervals.length - 1)];
    return Date.now() + (interval * 24 * 60 * 60 * 1000);
  }

  // Методы для достижений
  async checkAchievements(progress) {
    const allAchievements = await this.getAll('achievements');
    const unlockedIds = allAchievements.filter(a => a.unlocked).map(a => a.id);
    
    // Здесь должна быть логика проверки условий
    // Упрощенная версия
    return [];
  }

  async unlockAchievement(achievement) {
    achievement.unlocked = true;
    achievement.unlockedAt = Date.now();
    await this.set('achievements', achievement);
    
    const progress = await this.getUserProgress();
    if (!progress.achievements.includes(achievement.id)) {
      progress.achievements.push(achievement.id);
      await this.saveUserProgress(progress);
    }
    
    return achievement;
  }

  // Методы для настроек
  async getSetting(key) {
    const setting = await this.get('settings', key);
    return setting ? setting.value : null;
  }

  async setSetting(key, value) {
    return await this.set('settings', { key, value });
  }

  // Методы для истории чата
  async saveChatMessage(message) {
    message.timestamp = Date.now();
    return await this.set('chatHistory', message);
  }

  async getChatHistory(lessonId = null, limit = 50) {
    let messages = await this.getAll('chatHistory');
    
    if (lessonId) {
      messages = messages.filter(m => m.lessonId === lessonId);
    }
    
    messages.sort((a, b) => b.timestamp - a.timestamp);
    return messages.slice(0, limit).reverse();
  }

  async clearChatHistory(lessonId = null) {
    if (lessonId) {
      const messages = await this.getChatHistory(lessonId);
      for (const msg of messages) {
        await this.delete('chatHistory', msg.id);
      }
    } else {
      const allMessages = await this.getAll('chatHistory');
      for (const msg of allMessages) {
        await this.delete('chatHistory', msg.id);
      }
    }
  }

  // Сброс прогресса
  async resetProgress() {
    const stores = ['userProgress', 'wordsProgress', 'achievements', 'chatHistory'];
    for (const storeName of stores) {
      const allItems = await this.getAll(storeName);
      for (const item of allItems) {
        await this.delete(storeName, item.id || item.wordId);
      }
    }
  }
}

// Экспорт единственного экземпляра
export const storageService = new StorageService();
