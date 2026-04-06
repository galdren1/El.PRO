class ElectricalCalculator {
  constructor() {
    this.currentDensity = {
      cu: { open: 8, pipe: 6, tray: 7 },
      al: { open: 5, pipe: 4, tray: 4.5 }
    };
    this.resistivity = { cu: 0.0175, al: 0.028 };
    this.standardSections = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];
    this.standardRatings = [6, 10, 16, 20, 25, 32, 40, 50, 63];

    this.init();
  }

  init() {
    this.setupTabs();
    this.setupFormHandlers();
    new FeedbackForm();
  }

  setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
      });
    });
  }

  setupFormHandlers() {
    document.getElementById('cableForm').addEventListener('submit', (e) => this.handleCableCalculation(e));
    document.getElementById('automatForm').addEventListener('submit', (e) => this.handleAutomatCalculation(e));
    document.getElementById('groundingForm').addEventListener('submit', (e) => this.handleGroundingCalculation(e));
    document.getElementById('shortForm').addEventListener('submit', (e) => this.handleShortCalculation(e));
  }

  handleCableCalculation(e) {
    e.preventDefault();

    try {
      const powerKw = this.parseFloatSafe(document.getElementById('powerKw').value);
      const voltage = parseInt(document.getElementById('voltage').value, 10);
      const cosPhi = this.parseFloatSafe(document.getElementById('cosPhi').value) || 0.9;
      const material = document.getElementById('material').value;
      const laying = document.getElementById('laying').value;

      this.validateCableInput(powerKw);

      const current = this.calculateCurrent(powerKw, voltage, cosPhi);
      const density = this.currentDensity[material][laying];
      const section = current / density;
      const selectedSection = this.findStandardSection(section);

      if (!selectedSection) {
        throw new Error('Рассчитанное сечение слишком велико. Требуется нестандартное решение');
      }

      const result = this.generateCableResult(current, section, selectedSection, material, laying, voltage);
      this.showResult('cableResult', result, this.getResultStatus(result));
    } catch (error) {
      this.showError('cableResult', error.message);
    }
  }

  validateCableInput(powerKw) {
    if (!powerKw || powerKw <= 0) {
      throw new Error('Укажите корректную мощность нагрузки');
    }
  }

  calculateCurrent(powerKw, voltage, cosPhi) {
    if (voltage === 220) {
      return powerKw * 1000 / (220 * cosPhi); // 1 фаза
    } else {
      return powerKw * 1000 / (380 * Math.sqrt(3) * cosPhi); // 3 фазы
    }
  }

  findStandardSection(requiredSection) {
    return this.standardSections.find(s => s >= requiredSection);
  }

  generateCableResult(current, requiredSection, selectedSection, material, laying, voltage) {
    const length = 50; // м (можно сделать вводом пользователя)
    const resistivity = this.resistivity[material];
    const resistance = resistivity * length / selectedSection;
    const voltageDrop = current * resistance;
    const voltageDropPercent = (voltageDrop / voltage) * 100;

    let resultHtml = `
      <h4>Результаты расчёта кабеля:</h4>
      <p><strong>Расчётный ток:</strong> ${current.toFixed(2)} А</p>
      <p><strong>Требуемое сечение (мин.):</strong> ${requiredSection.toFixed(2)} мм²</p>
      <p><strong>Выбранное стандартное сечение:</strong> <span style="color: #38a169; font-weight: bold;">${selectedSection} мм²</span></p>
      <p><strong>Материал жилы:</strong> ${material === 'cu' ? 'Медь' : 'Алюминий'}</p>
      <p><strong>Способ прокладки:</strong> ${this.getLayingText(laying)}</p>
    `;

    resultHtml += `
      <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
        <p><strong>Падение напряжения:</strong> ${voltageDrop.toFixed(2)} В (${voltageDropPercent.toFixed(2)}%)</p>
        <p style="font-size: 0.9em; color: ${voltageDropPercent > 5 ? '#c53030' : '#38a169'}">
          ${voltageDropPercent > 5
        ? '⚠️ Превышено допустимое падение напряжения (5 %)'
        : '✅ В пределах нормы (≤ 5 %)'}
        </p>
      </div>
    `;

    return resultHtml;
  }

  getLayingText(laying) {
    const texts = {
      open: 'Открыто',
      pipe: 'В трубе',
      tray: 'В коробе'
    };
    return texts[laying] || laying;
  }

  handleAutomatCalculation(e) {
    e.preventDefault();

    try {
      const powerKw = this.parseFloatSafe(document.getElementById('automatPowerKw').value);
      const voltage = parseInt(document.getElementById('automatVoltage').value, 10);
      const cosPhi = this.parseFloatSafe(document.getElementById('automatCosPhi').value) || 0.9;
      const loadType = document.getElementById('loadType').value;

      this.validateAutomatInput(powerKw);

      // Расчётный ток нагрузки
      const current = this.calculateCurrent(powerKw, voltage, cosPhi);

      // Выбор номинала автомата (ближайший больший стандартный)
      const nominalRating = this.standardRatings.find(r => r >= current * 1.1); // Запас 10 %

      if (!nominalRating) {
        throw new Error('Ток нагрузки слишком высок для стандартных автоматов');
      }

      // Определение характеристики срабатывания
      const tripCurve = this.getTripCurve(loadType);

      // Проверка на КЗ (упрощённо)
      const maxShortCircuit = this.estimateShortCircuitCurrent(voltage);

      const result = this.generateAutomatResult(
        current,
        nominalRating,
        tripCurve,
        maxShortCircuit
      );

      this.showResult('automatResult', result, 'success');
    } catch (error) {
      this.showError('automatResult', error.message);
    }
  }

  validateAutomatInput(powerKw) {
    if (!powerKw || powerKw <= 0) {
      throw new Error('Укажите корректную мощность нагрузки');
    }
  }

  getTripCurve(loadType) {
    const curves = {
      lighting: 'B',
      general: 'C',
      motors: 'D'
    };
    return curves[loadType] || 'C';
  }

  estimateShortCircuitCurrent(voltage) {
    // Упрощённая оценка: 10 × номинальный ток сети
    return voltage === 220 ? 2500 : 6000; // А
  }

  generateAutomatResult(current, rating, curve, scCurrent) {
    return `
      <h4>Результаты расчёта автоматического выключателя:</h4>
      <p><strong>Расчётный ток нагрузки:</strong> ${current.toFixed(2)} А</p>
      <p><strong>Рекомендуемый номинал автомата:</strong> ${rating} А (характеристика ${curve})</p>
      <p><strong>Ожидаемый ток КЗ:</strong> ~${scCurrent} А</p>
      <p style="font-size: 0.9em; color: #718096;">
        <em>Примечание: для точного расчёта требуется схема сети и параметры трансформатора.</em>
      </p>
    `;
  }

  handleGroundingCalculation(e) {
    e.preventDefault();

    try {
      const soilResistivity = this.parseFloatSafe(document.getElementById('soilResistivity').value);
      const groundingType = document.getElementById('groundingType').value;

      this.validateGroundingInput(soilResistivity);

      let result;
      if (groundingType === 'rod') {
        result = this.calculateRodGrounding(soilResistivity);
      } else {
        result = this.calculateStripGrounding(soilResistivity);
      }

      this.showResult('groundingResult', result, 'success');
    } catch (error) {
      this.showError('groundingResult', error.message);
    }
  }

  validateGroundingInput(resistivity) {
    if (!resistivity || resistivity <= 0) {
      throw new Error('Укажите корректное сопротивление грунта');
    }
  }

  calculateRodGrounding(resistivity) {
    // Формула для вертикального заземлителя
    const length = 3; // м
    const diameter = 0.016; // м (16 мм)
    const depth = 0.7; // м

    const resistance = (resistivity / (2 * Math.PI * length)) *
      Math.log((2 * length) / diameter) + Math.log(4 * depth / length);

    return `
      <h4>Расчёт вертикального заземлителя:</h4>
      <p><strong>Удельное сопротивление грунта:</strong> ${resistivity} Ом·м</p>
      <p><strong>Длина стержня:</strong> ${length} м</p>
      <p><strong>Диаметр:</strong> ${diameter * 1000} мм</p>
      <p><strong>Глубина заложения:</strong> ${depth} м</p>
      <p><strong>Сопротивление заземлителя:</strong> ${resistance.toFixed(2)} Ом</p>
      <p style="color: ${resistance <= 4 ? '#38a169' : '#c53030'}">
        ${resistance <= 4
        ? '✅ Соответствует нормам ПУЭ (≤ 4 Ом)'
        : '⚠️ Превышает норму ПУЭ (> 4 Ом)'}
      </p>
    `;
  }

  calculateStripGrounding(resistivity) {
    // Формула для горизонтальной полосы
    const length = 10; // м
    const width = 0.04; // м (40 мм)
    const depth = 0.5; // м

    const resistance = (resistivity / (2 * Math.PI * length)) * Math.log(2 * length * length / (width * depth));

    return `
      <h4>Расчёт горизонтального заземлителя:</h4>
      <p><strong>Удельное сопротивление грунта:</strong> ${resistivity} Ом·м</p>
      <p><strong>Длина полосы:</strong> ${length} м</p>
      <p><strong>Ширина полосы:</strong> ${width * 100} см</p>
      <p><strong>Глубина заложения:</strong> ${depth} м</p>
      <p><strong>Сопротивление заземлителя:</strong> ${resistance.toFixed(2)} Ом</p>
      <p style="color: ${resistance <= 10 ? '#38a169' : '#c53030'}">
        ${resistance <= 10
        ? '✅ Соответствует нормам ПУЭ (≤ 10 Ом)'
        : '⚠️ Превышает норму ПУЭ (> 10 Ом)'}
      </p>
    `;
  }

  handleShortCalculation(e) {
    e.preventDefault();

    try {
      const transformerPower = this.parseFloatSafe(document.getElementById('transformerPower').value);
      const systemVoltage = this.parseFloatSafe(document.getElementById('systemVoltage').value);

      this.validateShortInput(transformerPower, systemVoltage);


      const shortCurrent = this.calculateShortCircuit(transformerPower, systemVoltage);
      const result = this.generateShortResult(shortCurrent, transformerPower, systemVoltage);

      this.showResult('shortResult', result, 'success');
    } catch (error) {
      this.showError('shortResult', error.message);
    }
  }

  validateShortInput(power, voltage) {
    if (!power || power <= 0) throw new Error('Укажите мощность трансформатора');
    if (!voltage || voltage <= 0) throw new Error('Укажите напряжение сети');
  }

  calculateShortCircuit(powerKva, voltageV) {
    // Приближённый расчёт тока КЗ
    const impedance = 0.06; // 6 % для трансформатора 250 кВА
    return (powerKva * 1000) / (voltageV * impedance * Math.sqrt(3));
  }

  generateShortResult(current, power, voltage) {
    return `
      <h4>Проверка на короткое замыкание:</h4>
      <p><strong>Мощность трансформатора:</strong> ${power} кВА</p>
      <p><strong>Напряжение сети:</strong> ${voltage} В</p>
      <p><strong>Ток короткого замыкания:</strong> ${current.toFixed(0)} А</p>
      <div style="margin-top: 15px; padding: 12px; background: #f8f9fa; border-radius: 6px;">
        <p><strong>Рекомендации по защите:</strong></p>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>Автомат должен иметь отключающую способность ≥ ${current.toFixed(0)} А</li>
          <li>Для трансформатора ${power} кВА рекомендуются автоматы с Icu ≥ 36 кА</li>
          <li>Проверьте селективность с вышестоящей защитой</li>
        </ul>
      </div>
      <p style="font-size: 0.9em; color: #718096; margin-top: 10px;">
        <em>Примечание: расчёт упрощённый. Для точного проектирования требуется анализ полной схемы сети.</em>
      </p>
    `;
  }

  parseFloatSafe(value) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  showResult(containerId, html, status = 'success') {
    const container = document.getElementById(containerId);
    container.innerHTML = html;
    container.style.display = 'block';
    container.className = `result-box result-${status}`;
  }

  showError(containerId, message) {
    this.showResult(containerId, `<p style="color: var(--color-error);">❌ Ошибка: ${message}</p>`, 'error');
  }

  getResultStatus(resultHtml) {
    if (resultHtml.includes('⚠️') || resultHtml.includes('превышает')) {
      return 'warning';
    }
    return 'success';
  }
}

class FeedbackForm {
  constructor() {
    this.modal = document.getElementById('feedbackModal');
    this.openBtn = document.getElementById('openFeedback');
    this.closeBtn = this.modal.querySelector('.close');
    this.form = document.getElementById('feedbackForm');

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.openBtn.addEventListener('click', () => this.show());
    this.closeBtn.addEventListener('click', () => this.hide());
    window.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });

    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  show() {
    this.modal.classList.add('show');
  }

  hide() {
    this.modal.classList.remove('show');
    this.form.reset();
  }

  handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(this.form);
    const data = Object.fromEntries(formData);

    // В реальном приложении здесь будет отправка на сервер
    console.log('Обратная связь отправлена:', data);

    document.getElementById('feedbackResult').innerHTML = `
      <p style="color: var(--color-success);">✅ Спасибо! Ваше сообщение отправлено.</p>
    `;
    document.getElementById('feedbackResult').style.display = 'block';

    setTimeout(() => this.hide(), 2000);
  }
}

// Инициализация приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  new ElectricalCalculator();
});
