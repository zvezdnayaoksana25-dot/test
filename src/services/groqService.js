// Сервис для работы с Groq API
export class GroqService {
  constructor() {
    this.apiKey = null;
    this.baseUrl = 'https://api.groq.com/openai/v1';
    this.model = 'llama-3.1-70b-versatile';
  }

  // Установка API ключа
  setApiKey(key) {
    this.apiKey = key;
    localStorage.setItem('groq_api_key', key);
  }

  // Получение API ключа из хранилища
  getApiKey() {
    return this.apiKey || localStorage.getItem('groq_api_key');
  }

  // Проверка наличия ключа
  hasApiKey() {
    return !!this.getApiKey();
  }

  // Отправка запроса к API
  async sendMessage(messages, options = {}) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('API ключ не установлен');
    }

    const defaultSystemPrompt = 'You are a friendly and helpful English language tutor. You help students learn English through conversation, explanations, and exercises. You correct mistakes gently and provide clear examples. Keep responses concise and focused on learning.';

    const fullMessages = [
      { role: 'system', content: options.systemPrompt || defaultSystemPrompt },
      ...messages
    ];

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: fullMessages,
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 500,
          top_p: options.topP || 1,
          stream: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Ошибка API Groq');
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Groq API Error:', error);
      throw error;
    }
  }

  // Генерация упражнений
  async generateExercise(topic, difficulty, count = 5) {
    const prompt = `Generate ${count} English learning exercises about "${topic}" for ${difficulty} level. 
    Format as JSON array with objects containing:
    - question: string (the exercise question in English)
    - options: string[] (4 multiple choice options)
    - correct: number (index of correct answer 0-3)
    - explanation: string (brief explanation in Russian)
    
    Only return the JSON array, no other text.`;

    const response = await this.sendMessage([
      { role: 'user', content: prompt }
    ], { maxTokens: 1000 });

    try {
      // Извлекаем JSON из ответа
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Не удалось распарсить JSON');
    } catch (e) {
      console.error('Failed to parse exercise:', e);
      return this.getFallbackExercises(topic, count);
    }
  }

  // Проверка письменного задания
  async checkWriting(text, prompt) {
    const systemPrompt = `You are an English writing tutor. Check the student's writing for:
    1. Grammar mistakes
    2. Vocabulary usage
    3. Sentence structure
    4. Coherence and flow
    
    Provide feedback in Russian with:
    - Overall score (0-100)
    - List of errors with corrections
    - Suggestions for improvement
    - Encouraging comments
    
    Format as JSON with: score, errors[], suggestions[], comment`;

    const userMessage = `Task: ${prompt}\n\nMy answer: ${text}`;

    const response = await this.sendMessage([
      { role: 'user', content: userMessage }
    ], { systemPrompt, maxTokens: 800 });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Не удалось распарсить JSON');
    } catch (e) {
      return {
        score: 70,
        errors: ['Автоматическая проверка не удалась'],
        suggestions: ['Попробуйте еще раз'],
        comment: response
      };
    }
  }

  // Диалог с AI репетитором
  async startConversation(scenario, userLevel) {
    const systemPrompt = `You are an English conversation partner. Scenario: ${scenario}
    Student level: ${userLevel}
    
    Rules:
    - Keep your responses natural and conversational
    - Use vocabulary appropriate for the student's level
    - Ask follow-up questions to keep the conversation going
    - Gently correct mistakes by rephrasing correctly
    - Keep responses short (1-3 sentences)
    - Be encouraging and friendly
    
    Start the conversation with an opening line related to the scenario.`;

    const response = await this.sendMessage([], { 
      systemPrompt, 
      maxTokens: 150 
    });
    
    return response;
  }

  // Продолжение диалога
  async continueConversation(history, userMessage, scenario) {
    const systemPrompt = `Continue the conversation. Scenario: ${scenario}
    Be natural, ask follow-up questions, and gently correct mistakes.`;

    const messages = history.map(h => ({
      role: h.isUser ? 'user' : 'assistant',
      content: h.text
    }));

    messages.push({ role: 'user', content: userMessage });

    return await this.sendMessage(messages, { 
      systemPrompt, 
      maxTokens: 200 
    });
  }

  // Объяснение грамматической темы
  async explainGrammar(topic, userLevel) {
    const prompt = `Explain the grammar topic "${topic}" for ${userLevel} level student in Russian.
    Include:
    1. Simple explanation
    2. Formula/structure
    3. 3-5 clear examples with Russian translations
    4. Common mistakes to avoid
    5. Practice tip
    
    Use simple language and formatting.`;

    return await this.sendMessage([
      { role: 'user', content: prompt }
    ], { maxTokens: 600 });
  }

  // Генерация слов для изучения
  async generateVocabularyList(category, level, count = 10) {
    const prompt = `Generate ${count} useful English words for ${level} level in category "${category}".
    Format as JSON array with:
    - word: string
    - transcription: string (IPA)
    - translation: string (Russian)
    - example: string (English sentence)
    - exampleTranslation: string (Russian)
    
    Only return the JSON array.`;

    const response = await this.sendMessage([
      { role: 'user', content: prompt }
    ], { maxTokens: 800 });

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Не удалось распарсить JSON');
    } catch (e) {
      return [];
    }
  }

  // Fallback упражнения при ошибке API
  getFallbackExercises(topic, count) {
    return [
      {
        question: `What is the correct form? (Topic: ${topic})`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correct: 0,
        explanation: 'Это упражнение-заглушка. Попробуйте позже.'
      }
    ];
  }

  // Очистка ключа
  clearApiKey() {
    this.apiKey = null;
    localStorage.removeItem('groq_api_key');
  }
}

// Экспорт единственного экземпляра
export const groqService = new GroqService();
