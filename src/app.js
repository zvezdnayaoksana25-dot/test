// Главное приложение English Master PWA
import { groqService } from './services/groqService.js';
import { storageService } from './services/storageService.js';
import { vocabularyData, grammarTopics, lessonsData, achievementsData, userLevels } from './data/content.js';

class EnglishMasterApp {
  constructor() {
    this.currentScreen = 'api-setup';
    this.userProgress = null;
    this.currentLesson = null;
    this.currentFlashcardIndex = 0;
    this.filteredVocabulary = [...vocabularyData];
    this.chatHistory = [];
    this.isInitialized = false;
  }

  // Инициализация приложения
  async init() {
    try {
      // Инициализация хранилища
      await storageService.init();
      
      // Загрузка прогресса пользователя
      this.userProgress = await storageService.getUserProgress();
      
      // Проверка API ключа
      if (groqService.hasApiKey()) {
        this.showMainApp();
      } else {
        this.setupApiScreenListeners();
      }
      
      // Регистрация service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
          .then(reg => console.log('SW registered:', reg))
          .catch(err => console.log('SW registration failed:', err));
      }
      
      this.isInitialized = true;
      console.log('App initialized');
    } catch (error) {
      console.error('Initialization error:', error);
      this.showToast('Ошибка загрузки приложения');
    }
  }

  // Настройка слушателей экрана API
  setupApiScreenListeners() {
    document.getElementById('save-api-key-btn').addEventListener('click', () => {
      const apiKey = document.getElementById('api-key-input').value.trim();
      if (apiKey) {
        groqService.setApiKey(apiKey);
        this.showMainApp();
        this.showToast('API ключ сохранен!');
      } else {
        this.showToast('Введите API ключ');
      }
    });

    document.getElementById('skip-api-key-btn').addEventListener('click', () => {
      this.showMainApp();
      this.showToast('AI функции будут недоступны');
    });
  }

  // Показ основного приложения
  showMainApp() {
    document.getElementById('api-setup-screen').classList.remove('active');
    document.getElementById('tab-bar').style.display = 'flex';
    this.navigateTo('home');
    this.updateUI();
  }

  // Навигация между экранами
  navigateTo(screenName) {
    // Скрываем все экраны
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });

    // Показываем нужный экран
    const targetScreen = document.getElementById(`${screenName}-screen`);
    if (targetScreen) {
      targetScreen.classList.add('active');
      this.currentScreen = screenName;
      
      // Обновляем активную вкладку
      document.querySelectorAll('.tab-item').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === screenName);
      });

      // Специфичная логика для экранов
      switch(screenName) {
        case 'home':
          this.updateHomeScreen();
          break;
        case 'lessons':
          this.renderLessonsList();
          break;
        case 'vocabulary':
          this.renderFlashcards();
          break;
        case 'achievements':
          this.renderAchievements();
          break;
        case 'settings':
          this.updateSettingsScreen();
          break;
      }
    }
  }

  // Обновление UI главного экрана
  updateHomeScreen() {
    const progress = this.userProgress;
    
    // Приветствие
    const hour = new Date().getHours();
    let greeting = 'Добрый день!';
    if (hour < 6) greeting = 'Доброй ночи!';
    else if (hour < 12) greeting = 'Доброе утро!';
    else if (hour < 18) greeting = 'Добрый день!';
    else greeting = 'Добрый вечер!';
    
    document.getElementById('user-greeting').textContent = `${greeting} 👋`;
    
    // Уровень
    const levelInfo = userLevels.find(l => l.level === progress.level) || userLevels[0];
    document.getElementById('user-level-text').textContent = `Уровень ${progress.level} • ${levelInfo.title}`;
    
    // XP прогресс
    const prevLevelXP = userLevels[progress.level - 2]?.maxXP || 0;
    const currentLevelMax = levelInfo.maxXP;
    const xpInCurrentLevel = progress.xp - prevLevelXP;
    const xpNeeded = currentLevelMax - prevLevelXP;
    const progressPercent = (xpInCurrentLevel / xpNeeded) * 100;
    
    document.getElementById('xp-text').textContent = `${progress.xp}/${currentLevelMax} XP`;
    document.getElementById('xp-progress').style.width = `${Math.min(progressPercent, 100)}%`;
    
    // Статистика
    document.getElementById('streak-value').textContent = progress.streak;
    document.getElementById('words-value').textContent = progress.wordsLearned;
    document.getElementById('lessons-value').textContent = progress.lessonsCompleted.length;
    document.getElementById('xp-total-value').textContent = progress.xp;
    
    // Слова для повторения
    storageService.getWordsForReview().then(words => {
      document.getElementById('words-to-review').textContent = `${words.length} слов ждут повторения`;
    });
    
    // Последние достижения
    this.renderRecentAchievements();
  }

  // Рендер списка уроков
  renderLessonsList() {
    const container = document.getElementById('lessons-list');
    const selectedLevel = document.getElementById('level-select').value;
    
    let filtered = lessonsData;
    if (selectedLevel !== 'all') {
      filtered = lessonsData.filter(l => l.level === selectedLevel);
    }
    
    container.innerHTML = filtered.map(lesson => {
      const isCompleted = this.userProgress.lessonsCompleted.includes(lesson.id);
      return `
        <div class="card" onclick="app.openLesson('${lesson.id}')" style="cursor: pointer;">
          <div class="card-header">
            <div>
              <div class="card-title">${lesson.title}</div>
              <div class="card-subtitle">${lesson.level} • ${lesson.duration} мин</div>
            </div>
            ${isCompleted ? '<span class="badge badge-success">✓</span>' : ''}
          </div>
          <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 12px;">
            ${lesson.description}
          </p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${lesson.objectives.slice(0, 3).map(obj => 
              `<span class="badge badge-gray">${obj}</span>`
            ).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // Фильтрация уроков
  filterLessons() {
    this.renderLessonsList();
  }

  // Открытие урока
  async openLesson(lessonId) {
    const lesson = lessonsData.find(l => l.id === lessonId);
    if (!lesson) return;
    
    this.currentLesson = lesson;
    document.getElementById('lesson-detail-title').textContent = lesson.title;
    
    const content = document.getElementById('lesson-detail-content');
    content.innerHTML = `
      <div class="card">
        <h3 style="font-size: 17px; font-weight: 600; margin-bottom: 12px;">О уроке</h3>
        <p style="color: var(--text-secondary); line-height: 1.5;">${lesson.description}</p>
        <div style="margin-top: 12px; display: flex; gap: 12px;">
          <span class="badge badge-primary">${lesson.level}</span>
          <span class="badge badge-gray">${lesson.duration} мин</span>
          <span class="badge badge-gray">${lesson.category}</span>
        </div>
      </div>
      
      ${lesson.content.dialogues.map((dialogue, idx) => `
        <div class="card">
          <h3 style="font-size: 17px; font-weight: 600; margin-bottom: 12px;">
            Диалог ${idx + 1}: ${dialogue.title}
          </h3>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${dialogue.lines.map(line => `
              <div style="background-color: var(--background-secondary); padding: 12px; border-radius: 8px;">
                <div style="font-weight: 600; color: var(--ios-blue); margin-bottom: 4px;">${line.speaker}:</div>
                <div>${line.text}</div>
                <div style="color: var(--text-secondary); font-size: 14px; margin-top: 4px;">${line.translation}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
      
      ${lesson.content.newWords ? `
        <div class="card">
          <h3 style="font-size: 17px; font-weight: 600; margin-bottom: 12px;">Новые слова</h3>
          <div class="ios-list">
            ${lesson.content.newWords.map(word => `
              <div class="ios-list-item">
                <div class="ios-list-content">
                  <div class="ios-list-title">${word.word}</div>
                  <div class="ios-list-subtitle">${word.translation}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      <button class="btn btn-primary btn-large" onclick="app.startLessonExercises()">
        Начать упражнения
      </button>
    `;
    
    this.navigateTo('lesson-detail');
  }

  // Начало упражнений урока
  async startLessonExercises() {
    if (!this.currentLesson) return;
    
    const exercises = this.currentLesson.content.exercises;
    if (!exercises || exercises.length === 0) {
      this.showToast('Упражнения скоро появятся');
      return;
    }
    
    // Простой тест с вопросами
    let correctCount = 0;
    
    for (const exercise of exercises) {
      if (exercise.type === 'multiple_choice') {
        for (const question of exercise.questions) {
          const answer = await this.showQuestion(question.question, question.options);
          if (answer === question.correct) {
            correctCount++;
          }
        }
      } else if (exercise.type === 'match' || exercise.type === 'fill_gap') {
        // Упрощенная обработка
        correctCount += exercise.pairs?.length || exercise.sentences?.length || 0;
      }
    }
    
    const score = Math.round((correctCount / (exercises.reduce((sum, e) => 
      sum + (e.questions?.length || e.pairs?.length || e.sentences?.length || 1), 0)) * 100));
    
    // Завершение урока
    await this.completeLesson(score);
  }

  // Показ вопроса (упрощенно)
  async showQuestion(question, options) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.innerHTML = `
        <div class="modal" style="max-width: 90%; width: 90%;">
          <div class="modal-body">
            <h3 style="margin-bottom: 16px;">${question}</h3>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${options.map((opt, idx) => `
                <button class="btn btn-secondary" data-idx="${idx}">${opt}</button>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      modal.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          modal.remove();
          resolve(idx);
        });
      });
    });
  }

  // Завершение урока
  async completeLesson(score) {
    const lesson = this.currentLesson;
    if (!lesson) return;
    
    // Добавляем XP
    const xpEarned = Math.round(50 * (score / 100));
    const result = await storageService.addXP(xpEarned);
    
    // Отмечаем урок как пройденный
    if (!this.userProgress.lessonsCompleted.includes(lesson.id)) {
      this.userProgress.lessonsCompleted.push(lesson.id);
      await storageService.saveUserProgress(this.userProgress);
    }
    
    // Показываем результат
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Урок завершен! 🎉</h3>
        </div>
        <div class="modal-body" style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">
            ${score >= 80 ? '🏆' : score >= 60 ? '⭐' : '💪'}
          </div>
          <div style="font-size: 32px; font-weight: 700; color: var(--ios-blue); margin-bottom: 8px;">
            ${score}%
          </div>
          <p style="color: var(--text-secondary);">+${xpEarned} XP</p>
          ${result.leveledUp ? `
            <div class="badge badge-warning" style="margin-top: 12px; font-size: 16px;">
              Новый уровень: ${result.newLevel}!
            </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="app.closeModalAndNavigate('${result.leveledUp ? 'home' : 'lessons'}')">Продолжить</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  closeModalAndNavigate(screen) {
    document.querySelector('.modal-overlay')?.remove();
    this.navigateTo(screen);
  }

  // Рендер карточек слов
  renderFlashcards() {
    const container = document.getElementById('flashcard-container');
    const word = this.filteredVocabulary[this.currentFlashcardIndex];
    
    if (!word) {
      container.innerHTML = '<div class="card"><p>Слова не найдены</p></div>';
      return;
    }
    
    container.innerHTML = `
      <div class="flashcard" onclick="this.classList.toggle('flipped')">
        <div class="flashcard-inner">
          <div class="flashcard-front">
            <div class="flashcard-word">${word.word}</div>
            <div class="flashcard-transcription">${word.transcription}</div>
            <div style="color: var(--text-secondary); font-size: 14px; margin-top: 20px;">
              Нажмите, чтобы увидеть перевод
            </div>
          </div>
          <div class="flashcard-back">
            <div class="flashcard-translation">${word.translation}</div>
            <div class="flashcard-example">${word.example}</div>
          </div>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 16px; color: var(--text-secondary);">
        Карточка ${this.currentFlashcardIndex + 1} из ${this.filteredVocabulary.length}
      </div>
    `;
  }

  // Фильтрация словаря
  filterVocabulary() {
    const category = document.getElementById('vocab-category-select').value;
    
    if (category === 'all') {
      this.filteredVocabulary = [...vocabularyData];
    } else {
      this.filteredVocabulary = vocabularyData.filter(w => w.category === category);
    }
    
    this.currentFlashcardIndex = 0;
    this.renderFlashcards();
  }

  // Отметка карточки как правильной
  async markCardCorrect() {
    const word = this.filteredVocabulary[this.currentFlashcardIndex];
    if (!word) return;
    
    await storageService.updateWordProgress(word.id, { interval: 1 });
    this.userProgress.wordsLearned++;
    await storageService.saveUserProgress(this.userProgress);
    
    this.nextCard();
    this.showToast('Отлично! +5 XP');
    storageService.addXP(5);
  }

  // Отметка карточки как неправильной
  async markCardIncorrect() {
    const word = this.filteredVocabulary[this.currentFlashcardIndex];
    if (!word) return;
    
    await storageService.markWordIncorrect(word.id);
    this.nextCard();
    this.showToast('Повторим позже');
  }

  // Следующая карточка
  nextCard() {
    this.currentFlashcardIndex = (this.currentFlashcardIndex + 1) % this.filteredVocabulary.length;
    this.renderFlashcards();
  }

  // Начало повторения слов
  async startWordReview() {
    const words = await storageService.getWordsForReview();
    if (words.length === 0) {
      this.showToast('Нет слов для повторения');
      return;
    }
    
    this.filteredVocabulary = words.map(w => vocabularyData.find(v => v.id === w.wordId)).filter(Boolean);
    this.currentFlashcardIndex = 0;
    this.navigateTo('vocabulary');
    this.renderFlashcards();
  }

  // Отправка сообщения в AI чат
  async sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    if (!groqService.hasApiKey()) {
      this.showToast('Необходим API ключ Groq');
      this.navigateTo('settings');
      return;
    }
    
    // Добавляем сообщение пользователя
    this.addChatMessage(message, true);
    input.value = '';
    
    // Показываем индикатор загрузки
    this.addChatMessage('...', false, true);
    
    try {
      // Получаем ответ от AI
      const response = await groqService.continueConversation(
        this.chatHistory,
        message,
        'General conversation practice'
      );
      
      // Удаляем индикатор загрузки
      document.querySelector('.chat-message.loading')?.remove();
      
      // Добавляем ответ AI
      this.addChatMessage(response, false);
      
      // Сохраняем в историю
      this.chatHistory.push({ isUser: true, text: message });
      this.chatHistory.push({ isUser: false, text: response });
      await storageService.saveChatMessage({ lessonId: 'ai-tutor', isUser: true, text: message });
      await storageService.saveChatMessage({ lessonId: 'ai-tutor', isUser: false, text: response });
    } catch (error) {
      document.querySelector('.chat-message.loading')?.remove();
      this.addChatMessage('Ошибка соединения. Проверьте API ключ.', false);
      console.error('Chat error:', error);
    }
  }

  // Добавление сообщения в чат
  addChatMessage(text, isUser, isLoading = false) {
    const container = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isUser ? 'user' : 'ai'}${isLoading ? ' loading' : ''}`;
    messageDiv.textContent = text;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
  }

  // Рендер достижений
  renderAchievements() {
    const container = document.getElementById('all-achievements');
    const unlockedIds = this.userProgress.achievements;
    
    container.innerHTML = achievementsData.map(ach => `
      <div class="achievement-item ${unlockedIds.includes(ach.id) ? 'unlocked' : ''}">
        <div class="achievement-icon">${ach.icon}</div>
        <div class="achievement-title">${ach.title}</div>
      </div>
    `).join('');
  }

  // Рендер последних достижений
  renderRecentAchievements() {
    const container = document.getElementById('recent-achievements');
    const unlockedIds = this.userProgress.achievements;
    const recent = achievementsData.filter(a => unlockedIds.includes(a.id)).slice(0, 6);
    
    if (recent.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--text-secondary);">
          Пройдите уроки, чтобы получить достижения!
        </div>
      `;
      return;
    }
    
    container.innerHTML = recent.map(ach => `
      <div class="achievement-item unlocked">
        <div class="achievement-icon">${ach.icon}</div>
        <div class="achievement-title">${ach.title}</div>
      </div>
    `).join('');
  }

  // Обновление настроек
  updateSettingsScreen() {
    const hasKey = groqService.hasApiKey();
    document.getElementById('api-key-status').textContent = hasKey ? 'Установлен ✓' : 'Не установлен';
  }

  // Показ модального окна API ключа
  showApiKeyModal() {
    document.getElementById('modal-api-key-input').value = groqService.getApiKey() || '';
    document.getElementById('api-modal').classList.add('show');
  }

  // Закрытие модального окна
  closeApiModal() {
    document.getElementById('api-modal').classList.remove('show');
  }

  // Сохранение API ключа из модалки
  saveApiKeyFromModal() {
    const key = document.getElementById('modal-api-key-input').value.trim();
    if (key) {
      groqService.setApiKey(key);
      this.closeApiModal();
      this.updateSettingsScreen();
      this.showToast('API ключ сохранен!');
    }
  }

  // Сброс прогресса
  async resetProgress() {
    if (!confirm('Вы уверены? Весь прогресс будет удален.')) return;
    
    await storageService.resetProgress();
    this.userProgress = await storageService.getUserProgress();
    this.updateUI();
    this.showToast('Прогресс сброшен');
  }

  // О приложении
  showAbout() {
    alert('English Master PWA v1.0.0\n\nПриложение для изучения английского языка с AI-репетитором.\n\nИспользуемые технологии:\n- Groq API (Llama 3.1)\n- IndexedDB для хранения\n- PWA для работы офлайн');
  }

  // Обновление всего UI
  updateUI() {
    this.updateHomeScreen();
    this.updateSettingsScreen();
  }

  // Показ toast уведомления
  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }
}

// Глобальный экземпляр приложения
window.app = new EnglishMasterApp();

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
