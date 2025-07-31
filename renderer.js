const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const result = document.getElementById('result');
const colorCountInput = document.getElementById('colorCount');
const filterBWInput = document.getElementById('filterBW');
const darkModeToggle = document.getElementById('darkModeToggle');
const algoSelect = document.getElementById('algoSelect');
const imageContainer = document.getElementById('imageContainer');
const selectionCanvas = document.getElementById('selectionCanvas');
const selectionControls = document.getElementById('selectionControls');
const clearSelectionBtn = document.getElementById('clearSelection');
const undoLastBtn = document.getElementById('undoLast');

const analyzeSelectionBtn = document.getElementById('analyzeSelection');
const objectCounter = document.getElementById('objectCounter');

const analyzeSelectionXBtn = document.getElementById('analyzeSelectionX');
const analyzeSelectionXManualBtn = document.getElementById('analyzeSelectionXManual');

let colorCount = parseInt(colorCountInput.value, 10);
let filterBW = filterBWInput.checked;
let algo = algoSelect.value;

// Переменные для интерактивного выделения
let isDrawing = false;
let currentPath = [];
let selectedObjects = [];
let canvasContext = null;

// Глобальная переменная для хранения результатов анализа
let lastAnalysisResults = null;

// Глобальные переменные для color picker
let currentColorTarget = null;
let selectedColor = '#3b82f6';

// Глобальные переменные для связывания объектов с цветами
let objectColorAssignments = new Map(); // objectId -> colorType (primary/secondary/accent)

darkModeToggle.addEventListener('change', () => {
  document.body.classList.toggle('dark', darkModeToggle.checked);
});

algoSelect.addEventListener('change', () => {
  algo = algoSelect.value;
  if (algo === 'interactive') {
    selectionControls.style.display = 'block';
    document.getElementById('spotModeXControls').style.display = 'none';
    document.getElementById('spotModeXPanel').style.display = 'none';
    document.getElementById('manualColorAssignmentPanel').style.display = 'none';
    if (preview.src && preview.classList.contains('show')) {
      setupInteractiveMode();
    }
  } else if (algo === 'spotmodex') {
    selectionControls.style.display = 'none';
    document.getElementById('spotModeXControls').style.display = 'block';
    document.getElementById('spotModeXPanel').style.display = 'block';
    document.getElementById('manualColorAssignmentPanel').style.display = 'block';
    if (preview.src && preview.classList.contains('show')) {
      setupInteractiveMode();
    }
  } else {
    selectionControls.style.display = 'none';
    document.getElementById('spotModeXControls').style.display = 'none';
    document.getElementById('spotModeXPanel').style.display = 'none';
    document.getElementById('manualColorAssignmentPanel').style.display = 'none';
    // Отключаем обработчики событий мыши для других алгоритмов
    disableInteractiveMode();
    if (preview.src && preview.classList.contains('show')) analyzeImage(preview);
  }
});

colorCountInput.addEventListener('change', () => {
  colorCount = parseInt(colorCountInput.value, 10);
  if (preview.src && preview.classList.contains('show')) analyzeImage(preview);
});
filterBWInput.addEventListener('change', () => {
  filterBW = filterBWInput.checked;
  if (preview.src && preview.classList.contains('show')) analyzeImage(preview);
});

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.style.background = '#e0e7ef';
});
dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.style.background = '';
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.style.background = '';
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  handleFile(file);
});

function handleFile(file) {
  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.classList.remove('show');
  imageContainer.style.display = 'none';
  preview.onload = () => {
    preview.classList.add('show');
    imageContainer.style.display = 'block';
    if (algo === 'interactive') {
      setupInteractiveMode();
    } else if (algo === 'spotmodex') {
      setupInteractiveMode();
    } else {
      analyzeImage(preview);
    }
    URL.revokeObjectURL(url);
  };
}

function rgbToHex(rgb) {
  return '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r, g, b) {
  // Проверяем валидность входных данных
  if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number' ||
      isNaN(r) || isNaN(g) || isNaN(b)) {
    console.warn('Invalid RGB values in rgbToHsl:', { r, g, b });
    return [0, 0, 0]; // Возвращаем черный цвет по умолчанию
  }
  
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function isBWorGray(rgb) {
  // Проверяем валидность входных данных
  if (!rgb || !Array.isArray(rgb) || rgb.length < 3) {
    console.warn('Invalid RGB in isBWorGray:', rgb);
    return false; // По умолчанию считаем цветным
  }
  
  // Только фильтрация по насыщенности (saturation)
  const [h, s, l] = rgbToHsl(...rgb);
  return s < 0.12;
}

function analyzeImage(img) {
  if (!img.complete || img.naturalWidth === 0) {
    result.innerHTML = 'Image not loaded';
    return;
  }
  let palette;
  let percents;
  let sortedNames = null;
  if (algo === 'colorthief') {
    const colorThief = new ColorThief();
    try {
      palette = colorThief.getPalette(img, colorCount);
    } catch (e) {
      result.innerHTML = '<div style="color:#e53e3e">Image analysis error</div>';
      return;
    }
    // Фильтрация белого/чёрного/серого
    let filteredPalette = palette;
    if (filterBW) {
      filteredPalette = palette.filter(c => !isBWorGray(c));
      if (filteredPalette.length === 0) filteredPalette = palette; // fallback
    }
    palette = filteredPalette;
    // Canvas-анализ для процентов
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const counts = new Array(palette.length).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const pixel = [data[i], data[i+1], data[i+2]];
      let minDist = Infinity, idx = 0;
      for (let j = 0; j < palette.length; j++) {
        const dist = colorDist(pixel, palette[j]);
        if (dist < minDist) {
          minDist = dist;
          idx = j;
        }
      }
      counts[idx]++;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    percents = counts.map(c => Math.round((c / total) * 100));
    
    // Сортировка по убыванию процента
    const zipped = palette.map((color, i) => ({ color, percent: percents[i] }));
    zipped.sort((a, b) => b.percent - a.percent);
    palette = zipped.map(z => z.color);
    percents = zipped.map(z => z.percent);
  } else if (algo === 'kmeans') {
    // --- K-means ---
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // Собираем пиксели
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
      // Пропускаем прозрачные пиксели
      if (data[i+3] < 128) continue;
      pixels.push([data[i], data[i+1], data[i+2]]);
    }
    // K-means кластеризация
    palette = kmeansPalette(pixels, colorCount);
    // Фильтрация белого/чёрного/серого
    let filteredPalette = palette;
    if (filterBW) {
      filteredPalette = palette.filter(c => !isBWorGray(c));
      if (filteredPalette.length === 0) filteredPalette = palette; // fallback
    }
    palette = filteredPalette;
    // Считаем проценты
    const counts = new Array(palette.length).fill(0);
    for (const px of pixels) {
      let minDist = Infinity, idx = 0;
      for (let j = 0; j < palette.length; j++) {
        const dist = colorDist(px, palette[j]);
        if (dist < minDist) {
          minDist = dist;
          idx = j;
        }
      }
      counts[idx]++;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    percents = counts.map(c => Math.round((c / total) * 100));
    // Сортировка по убыванию процента
    const zipped = palette.map((color, i) => ({ color, percent: percents[i] }));
    zipped.sort((a, b) => b.percent - a.percent);
    palette = zipped.map(z => z.color);
    percents = zipped.map(z => z.percent);

   } else if (algo === 'illumination') {
     // --- Illumination Compensated Analysis ---
     const canvas = document.createElement('canvas');
     canvas.width = img.naturalWidth;
     canvas.height = img.naturalHeight;
     const ctx = canvas.getContext('2d');
     ctx.drawImage(img, 0, 0);
     const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
     
     // Собираем все пиксели
     const pixels = [];
     for (let i = 0; i < data.length; i += 4) {
       if (data[i+3] >= 128) { // Непрозрачные пиксели
         pixels.push([data[i], data[i+1], data[i+2]]);
       }
     }
     
     if (pixels.length === 0) {
       result.innerHTML = '<div style="color:#e53e3e">No valid pixels found</div>';
       return;
     }
     
     // Нормализация цвета для компенсации освещения
     const normalizedPixels = pixels.map(pixel => {
       const [r, g, b] = pixel;
       const sum = r + g + b;
       if (sum === 0) return [0, 0, 0];
       
       // Нормализуем к сумме 255 для компенсации яркости
       const normalizedR = Math.round((r / sum) * 255);
       const normalizedG = Math.round((g / sum) * 255);
       const normalizedB = Math.round((b / sum) * 255);
       
       return [normalizedR, normalizedG, normalizedB];
     });
     
     // Группируем похожие нормализованные цвета
     const colorGroups = new Map();
     const tolerance = 30; // Допуск для группировки похожих цветов
     
     for (const pixel of normalizedPixels) {
       let grouped = false;
       
       for (const [key, group] of colorGroups) {
         const [r, g, b] = key.split(',').map(Number);
         const dist = colorDist(pixel, [r, g, b]);
         
         if (dist < tolerance) {
           // Добавляем к существующей группе
           group.count++;
           group.pixels.push(pixel);
           grouped = true;
           break;
         }
       }
       
       if (!grouped) {
         // Создаем новую группу
         const key = pixel.join(',');
         colorGroups.set(key, {
           color: pixel,
           count: 1,
           pixels: [pixel]
         });
       }
     }
     
     // Сортируем группы по размеру
     const sortedGroups = Array.from(colorGroups.values())
       .sort((a, b) => b.count - a.count)
       .slice(0, colorCount);
     
     // Вычисляем средний цвет для каждой группы
     palette = sortedGroups.map(group => {
       const totalPixels = group.pixels.length;
       const avgR = Math.round(group.pixels.reduce((sum, p) => sum + p[0], 0) / totalPixels);
       const avgG = Math.round(group.pixels.reduce((sum, p) => sum + p[1], 0) / totalPixels);
       const avgB = Math.round(group.pixels.reduce((sum, p) => sum + p[2], 0) / totalPixels);
       return [avgR, avgG, avgB];
     });
     
     // Фильтрация белого/чёрного/серого
     let filteredPalette = palette;
     if (filterBW) {
       filteredPalette = palette.filter(c => !isBWorGray(c));
       if (filteredPalette.length === 0) filteredPalette = palette; // fallback
     }
     palette = filteredPalette;
     
     // Считаем проценты
     const totalPixels = pixels.length;
     percents = palette.map((color, index) => {
       const group = sortedGroups[index];
       return Math.round((group.count / totalPixels) * 100);
     });
   } else if (algo === 'rgbsplit') {
    // --- RGB+BWGS Split ---
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const baseColors = [
      [255, 0, 0], // Red
      [0, 255, 0], // Green
      [0, 0, 255], // Blue
      [128, 128, 128] // BWGS (gray, black, white, silver)
    ];
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i+3] < 128) continue;
      const pixel = [data[i], data[i+1], data[i+2]];
      // Если пиксель близок к серому/чёрному/белому — кластер 3
      const [h, s, l] = rgbToHsl(...pixel);
      if (s < 0.12) {
        counts[3]++;
        continue;
      }
      let minDist = Infinity, idx = 0;
      for (let j = 0; j < 3; j++) {
        const dist = colorDist(pixel, baseColors[j]);
        if (dist < minDist) {
          minDist = dist;
          idx = j;
        }
      }
      counts[idx]++;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    palette = baseColors;
    percents = counts.map(c => Math.round((c / total) * 100));
    // Сортировка по убыванию процента
    const zipped = palette.map((color, i) => ({ color, percent: percents[i] }));
    zipped.sort((a, b) => b.percent - a.percent);
    palette = zipped.map(z => z.color);
    percents = zipped.map(z => z.percent);
  } else if (algo === 'fixed6') {
    // --- Fixed 6 Colors (Red, Green, Blue, Cyan, Yellow, Purple) ---
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    // Фиксированные базовые цвета
    const baseColors = [
      [255, 0, 0],    // Red
      [0, 255, 0],    // Green
      [0, 0, 255],    // Blue
      [0, 255, 255],  // Cyan
      [255, 255, 0],  // Yellow
      [255, 0, 255]   // Purple
    ];
    
    const colorNames = ['Red', 'Green', 'Blue', 'Cyan', 'Yellow', 'Purple'];
    const counts = [0, 0, 0, 0, 0, 0];
    
    for (let i = 0; i < data.length; i += 4) {
      if (data[i+3] < 128) continue; // Пропускаем прозрачные пиксели
      
      const pixel = [data[i], data[i+1], data[i+2]];
      
      // Находим ближайший базовый цвет
      let minDist = Infinity, idx = 0;
      for (let j = 0; j < baseColors.length; j++) {
        const dist = colorDist(pixel, baseColors[j]);
        if (dist < minDist) {
          minDist = dist;
          idx = j;
        }
      }
      counts[idx]++;
    }
    
    const total = counts.reduce((a, b) => a + b, 0);
    palette = baseColors;
    percents = counts.map(c => Math.round((c / total) * 100));
    
    // Сортировка по убыванию процента
    const zipped = palette.map((color, i) => ({ 
      color, 
      percent: percents[i], 
      name: colorNames[i] 
    }));
    zipped.sort((a, b) => b.percent - a.percent);
    palette = zipped.map(z => z.color);
    percents = zipped.map(z => z.percent);
    sortedNames = zipped.map(z => z.name);
  }

  // Fancy визуализация
  let html = '<div class="color-bar">';
  for (let i = 0; i < palette.length; i++) {
    html += `<div class="color-segment" style="width:${percents[i]}%;background:${rgbToHex(palette[i])}"></div>`;
  }
  html += '</div>';
  html += '<ul class="color-list">';
  for (let i = 0; i < palette.length; i++) {
    const colorName = algo === 'fixed6' && sortedNames ? sortedNames[i] : '';
    const nameDisplay = colorName ? ` <span style="color:#3b82f6;font-weight:500;margin-left:4px;">(${colorName})</span>` : '';
    html += `<li><span class="color-dot" style="background:${rgbToHex(palette[i])}"></span> <b>${percents[i]}%</b> <span style="color:#7a869a;font-size:0.98em;margin-left:8px;">${rgbToHex(palette[i])}</span>${nameDisplay}</li>`;
  }
  html += '</ul>';
  result.innerHTML = html;
}

// Простая реализация k-means для RGB
function kmeansPalette(pixels, k, maxIter = 10) {
  if (pixels.length === 0) return [];
  // Инициализация центров случайными пикселями
  let centers = [];
  for (let i = 0; i < k; i++) {
    centers.push(pixels[Math.floor(Math.random() * pixels.length)]);
  }
  let assignments = new Array(pixels.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    // Назначение пикселей ближайшему центру
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity, idx = 0;
      for (let j = 0; j < centers.length; j++) {
        const dist = colorDist(pixels[i], centers[j]);
        if (dist < minDist) {
          minDist = dist;
          idx = j;
        }
      }
      assignments[i] = idx;
    }
    // Пересчёт центров
    let newCenters = new Array(k).fill(0).map(() => [0,0,0]);
    let counts = new Array(k).fill(0);
    for (let i = 0; i < pixels.length; i++) {
      const idx = assignments[i];
      newCenters[idx][0] += pixels[i][0];
      newCenters[idx][1] += pixels[i][1];
      newCenters[idx][2] += pixels[i][2];
      counts[idx]++;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        newCenters[j][0] = Math.round(newCenters[j][0] / counts[j]);
        newCenters[j][1] = Math.round(newCenters[j][1] / counts[j]);
        newCenters[j][2] = Math.round(newCenters[j][2] / counts[j]);
      } else {
        // Если кластер пустой, выбрать случайный пиксель
        newCenters[j] = pixels[Math.floor(Math.random() * pixels.length)];
      }
    }
    centers = newCenters;
  }
  return centers;
}

function colorDist(a, b) {
  // Проверяем валидность входных данных
  if (!a || !b || !Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) {
    console.warn('Invalid colors in colorDist:', { a, b });
    return Infinity; // Возвращаем максимальное расстояние для невалидных цветов
  }
  
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) +
    Math.pow(a[1] - b[1], 2) +
    Math.pow(a[2] - b[2], 2)
  );
}

// Функции для интерактивного режима
function setupInteractiveMode() {
  // Настраиваем canvas для выделения
  selectionCanvas.width = preview.offsetWidth;
  selectionCanvas.height = preview.offsetHeight;
  canvasContext = selectionCanvas.getContext('2d');
  
  // Очищаем предыдущие выделения
  selectedObjects = [];
  currentPath = [];
  clearCanvas();
  updateObjectCounter();
  
  // Устанавливаем курсор-крестик
  preview.style.cursor = 'crosshair';
  
  // Удаляем старые обработчики событий
  preview.removeEventListener('mousedown', startDrawing);
  preview.removeEventListener('mousemove', updateDrawing);
  preview.removeEventListener('mouseup', endDrawing);
  preview.removeEventListener('dblclick', finishObject);
  clearSelectionBtn.removeEventListener('click', clearAll);
  undoLastBtn.removeEventListener('click', undoLast);

  analyzeSelectionBtn.removeEventListener('click', analyzeSelectedObjects);
  analyzeSelectionBtn.removeEventListener('click', analyzeSelectedObjectsIndependent);
  
  // Добавляем обработчики событий
  preview.addEventListener('mousedown', startDrawing);
  preview.addEventListener('mousemove', updateDrawing);
  preview.addEventListener('mouseup', endDrawing);
  preview.addEventListener('dblclick', finishObject);
  
  // Обработчики кнопок
  clearSelectionBtn.addEventListener('click', clearAll);
  undoLastBtn.addEventListener('click', undoLast);

  analyzeSelectionBtn.addEventListener('click', analyzeSelectedObjectsIndependent);
  
  // Обработчик кнопки оптимизации
  const optimizeBtn = document.getElementById('optimizeColors');
  if (optimizeBtn) {
    optimizeBtn.addEventListener('click', optimizeColorsToTop3);
  }
  
  // Обработчики для быстрого выбора цветов
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('color-option')) {
      const color = e.target.dataset.color;
      const target = e.target.dataset.target;
      const targetBtn = document.getElementById(target + 'ColorBtn');
      
      if (targetBtn) {
        targetBtn.style.background = color;
        targetBtn.dataset.color = color;
      }
    }
  });
  
  // Обработчики для Spot Mode X Controls
  const clearSelectionXBtn = document.getElementById('clearSelectionX');
  const undoLastXBtn = document.getElementById('undoLastX');
  const analyzeSelectionXBtn = document.getElementById('analyzeSelectionX');
  const analyzeSelectionXManualBtn = document.getElementById('analyzeSelectionXManual');
  
  if (clearSelectionXBtn) {
    clearSelectionXBtn.addEventListener('click', clearAll);
  }
  if (undoLastXBtn) {
    undoLastXBtn.addEventListener('click', undoLast);
  }
  if (analyzeSelectionXBtn) {
    analyzeSelectionXBtn.addEventListener('click', analyzeSpotModeXObjects);
  }
  if (analyzeSelectionXManualBtn) {
    analyzeSelectionXManualBtn.addEventListener('click', analyzeSpotModeXManual);
  }
  
  // Обработчик клавиши Enter
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (algo === 'interactive' || algo === 'spotmodex')) {
      finishCurrentObject();
    }
  });
  
  // Обработчик изменения размера окна
  window.addEventListener('resize', () => {
    if (algo === 'interactive' && preview.src) {
      setTimeout(() => {
        selectionCanvas.width = preview.offsetWidth;
        selectionCanvas.height = preview.offsetHeight;
        canvasContext = selectionCanvas.getContext('2d');
        drawAllObjects();
      }, 100);
    }
  });
}

function disableInteractiveMode() {
  // Отключаем обработчики событий мыши
  preview.removeEventListener('mousedown', startDrawing);
  preview.removeEventListener('mousemove', updateDrawing);
  preview.removeEventListener('mouseup', endDrawing);
  preview.removeEventListener('dblclick', finishObject);
  
  // Сбрасываем состояние рисования
  isDrawing = false;
  currentPath = [];
  
  // Очищаем canvas
  if (canvasContext) {
    clearCanvas();
  }
  
  // Убираем курсор-крестик
  preview.style.cursor = 'default';
}

function startDrawing(e) {
  isDrawing = true;
  const rect = preview.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  currentPath = [{ x, y }];
  drawCurrentPath();
  
}

function updateDrawing(e) {
  if (!isDrawing) return;
  
  const rect = preview.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  // Добавляем точку только если она достаточно далеко от предыдущей
  const lastPoint = currentPath[currentPath.length - 1];
  const distance = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
  
  if (distance > 5) {
    currentPath.push({ x, y });
    drawCurrentPath();
  }
}

function endDrawing(e) {
  if (!isDrawing) return;
  
  const rect = preview.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  currentPath.push({ x, y });
  drawCurrentPath();
}

function finishObject(e) {
  finishCurrentObject();
}

function finishCurrentObject() {
  if (currentPath.length > 2) {
    // Замыкаем путь
    currentPath.push(currentPath[0]);
    
    // Добавляем объект
    const object = {
      id: selectedObjects.length + 1,
      path: [...currentPath]
    };
    
    selectedObjects.push(object);
    currentPath = [];
    isDrawing = false;
    drawAllObjects();
    updateObjectCounter();
    
    // Добавляем объект в Manual Color Assignment для Spot Mode X
    if (algo === 'spotmodex') {
      addObjectToManualAssignment(object.id);
    }
    
    console.log('Object added:', object.id);
    console.log('Total objects:', selectedObjects.length);
  }
}

// Функция для добавления объекта в Manual Color Assignment
function addObjectToManualAssignment(objectId) {
  const manualContent = document.getElementById('manualColorAssignmentContent');
  if (!manualContent) return;
  
  // Получаем выбранные цвета для кнопок
  const primaryColorHex = document.getElementById('primaryColorBtn').dataset.color;
  const secondaryColorHex = document.getElementById('secondaryColorBtn').dataset.color;
  const accentColorHex = document.getElementById('accentColorBtn').dataset.color;
  
  const objectColor = getObjectColor(objectId - 1);
  
  const objectDiv = document.createElement('div');
  objectDiv.style.cssText = `
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 5px;
    padding: 6px 7px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 0.92rem;
  `;
  
  objectDiv.innerHTML = `
    <div style="display:flex;align-items:center;gap:5px;">
      <div style="width:10px;height:10px;background:${objectColor};border-radius:50%;"></div>
      <span style="font-size:0.98rem;color:#374151;white-space:nowrap;">Object ${objectId}</span>
    </div>
    <div style="display:flex;gap:2px;">
      <button onclick="assignColorToObject(${objectId}, 'primary')" style="padding:3px 7px;font-size:0.78rem;border:none;border-radius:3px;cursor:pointer;background:#f1f5f9;color:#64748b;min-width:38px;outline:none;">Primary</button>
      <button onclick="assignColorToObject(${objectId}, 'secondary')" style="padding:3px 7px;font-size:0.78rem;border:none;border-radius:3px;cursor:pointer;background:#f1f5f9;color:#64748b;min-width:38px;outline:none;">Secondary</button>
      <button onclick="assignColorToObject(${objectId}, 'accent')" style="padding:3px 7px;font-size:0.78rem;border:none;border-radius:3px;cursor:pointer;background:#f1f5f9;color:#64748b;min-width:38px;outline:none;">Accent</button>
    </div>
  `;
  
  manualContent.appendChild(objectDiv);
}

// Функция для удаления объекта из Manual Color Assignment
function removeObjectFromManualAssignment(objectId) {
  const manualContent = document.getElementById('manualColorAssignmentContent');
  if (!manualContent) return;
  
  // Находим и удаляем элемент объекта
  const objectElements = manualContent.querySelectorAll('div');
  objectElements.forEach(element => {
    const button = element.querySelector('button');
    if (button && button.getAttribute('onclick').includes(`assignColorToObject(${objectId}`)) {
      element.remove();
    }
  });
  
  // Панель остается видимой даже без объектов
}

function clearCanvas() {
  canvasContext.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
}

function drawCurrentPath() {
  clearCanvas();
  drawAllObjects();
  
  if (currentPath.length > 1) {
    canvasContext.strokeStyle = '#3b82f6';
    canvasContext.lineWidth = 2;
    canvasContext.setLineDash([]);
    canvasContext.beginPath();
    canvasContext.moveTo(currentPath[0].x, currentPath[0].y);
    
    for (let i = 1; i < currentPath.length; i++) {
      canvasContext.lineTo(currentPath[i].x, currentPath[i].y);
    }
    
    canvasContext.stroke();
  }
}

function drawAllObjects() {
  clearCanvas();
  
  selectedObjects.forEach((object, index) => {
    const color = getObjectColor(index);
    
    // Рисуем контур
    canvasContext.strokeStyle = color;
    canvasContext.lineWidth = 2;
    canvasContext.setLineDash([]);
    canvasContext.beginPath();
    canvasContext.moveTo(object.path[0].x, object.path[0].y);
    
    for (let i = 1; i < object.path.length; i++) {
      canvasContext.lineTo(object.path[i].x, object.path[i].y);
    }
    
    canvasContext.stroke();
    
    // Добавляем номер объекта
    canvasContext.fillStyle = color;
    canvasContext.font = 'bold 14px Arial';
    canvasContext.fillText(`${object.id}`, object.path[0].x + 5, object.path[0].y + 15);
  });
}

function getObjectColor(index) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  return colors[index % colors.length];
}

function clearAll() {
  selectedObjects = [];
  currentPath = [];
  clearCanvas();
  result.innerHTML = '';
  updateObjectCounter();
  
  // Скрываем кнопку оптимизации и очищаем результаты
  const optimizeBtn = document.getElementById('optimizeColors');
  if (optimizeBtn) {
    optimizeBtn.style.display = 'none';
  }
  lastAnalysisResults = null;
  
  // Очищаем назначения цветов (панель остается видимой в Spot Mode X)
  objectColorAssignments.clear();
  
  // Очищаем Manual Color Assignment для Spot Mode X
  if (algo === 'spotmodex') {
    const manualContent = document.getElementById('manualColorAssignmentContent');
    if (manualContent) {
      manualContent.innerHTML = '';
    }
  }
}

function updateObjectCounter() {
  if (objectCounter) {
    objectCounter.textContent = `Objects: ${selectedObjects.length}/50`;
    // Меняем цвет при приближении к лимиту
    if (selectedObjects.length >= 45) {
      objectCounter.style.color = '#e53e3e'; // Красный
    } else if (selectedObjects.length >= 35) {
      objectCounter.style.color = '#f59e0b'; // Оранжевый
    } else {
      objectCounter.style.color = '#6b7280'; // Нейтральный серый
    }
  }
  
  // Обновляем счетчик для Spot Mode X
  const objectCounterX = document.getElementById('objectCounterX');
  if (objectCounterX) {
    objectCounterX.textContent = `Objects: ${selectedObjects.length}/50`;
    // Меняем цвет при приближении к лимиту
    if (selectedObjects.length >= 45) {
      objectCounterX.style.color = '#e53e3e'; // Красный
    } else if (selectedObjects.length >= 35) {
      objectCounterX.style.color = '#f59e0b'; // Оранжевый
    } else {
      objectCounterX.style.color = '#6b7280'; // Нейтральный серый
    }
  }
}

function undoLast() {
  if (selectedObjects.length > 0) {
    const removedObjectId = selectedObjects.length; // ID последнего объекта
    selectedObjects.pop();
    drawAllObjects();
    updateObjectCounter();
    
    // Удаляем объект из Manual Color Assignment для Spot Mode X
    if (algo === 'spotmodex') {
      removeObjectFromManualAssignment(removedObjectId);
    }
    
    console.log('Last object removed. Total objects:', selectedObjects.length);
  }
}

function analyzeSelectedObjects() {
  console.log('Analyzing objects:', selectedObjects.length);
  console.log('Selected objects:', selectedObjects);
  
  if (selectedObjects.length === 0) {
    result.innerHTML = '<div style="color:#e53e3e">No objects selected. Please draw around objects first.</div>';
    return;
  }
  
  // Ограничиваем количество объектов для производительности
  const maxObjects = 50; // Увеличено с 20 до 50 объектов
  if (selectedObjects.length > maxObjects) {
    result.innerHTML = `<div style="color:#e53e3e">Too many objects (${selectedObjects.length}). Please select no more than ${maxObjects} objects.</div>`;
    return;
  }
  
  // Создаем временный canvas для анализа
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = preview.naturalWidth;
  tempCanvas.height = preview.naturalHeight;
  
  // Рисуем изображение на временном canvas
  tempCtx.drawImage(preview, 0, 0);
  
  // Конвертируем координаты из отображаемого размера в натуральный
  const scaleX = preview.naturalWidth / preview.offsetWidth;
  const scaleY = preview.naturalHeight / preview.offsetHeight;
  
  console.log('Scale factors:', { scaleX, scaleY });
  console.log('Preview dimensions:', { 
    naturalWidth: preview.naturalWidth, 
    naturalHeight: preview.naturalHeight,
    offsetWidth: preview.offsetWidth, 
    offsetHeight: preview.offsetHeight 
  });
  
  // Проверяем валидность размеров
  if (!preview.naturalWidth || !preview.naturalHeight || !preview.offsetWidth || !preview.offsetHeight) {
    console.error('Invalid preview dimensions');
    result.innerHTML = '<div style="color:#e53e3e">Invalid image dimensions</div>';
    return;
  }
  
  // Собираем пиксели из всех объектов
  const allPixels = new Set(); // Используем Set для уникальности пикселей между объектами
  const pixelToObject = new Map(); // Связываем пиксель с объектом
  const objectPixelCounts = new Array(selectedObjects.length).fill(0);
  
  try {
    selectedObjects.forEach((object, objectIndex) => {
      console.log(`Processing object ${objectIndex + 1}:`, object);
      
      if (!object.path || object.path.length < 3) {
        console.error(`Object ${objectIndex + 1} has invalid path:`, object.path);
        return;
      }
      
      // Создаем путь для проверки попадания пикселей
      const naturalPath = object.path.map(point => ({
        x: Math.round(point.x * scaleX),
        y: Math.round(point.y * scaleY)
      }));
      
      console.log('Natural path:', naturalPath);
      
      // Получаем границы объекта
      const bounds = getPathBounds(naturalPath);
      console.log('Object bounds:', bounds);
      
      // Проверяем каждый пиксель в границах
      const area = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
      console.log(`Object ${objectIndex + 1} area: ${area} pixels`);
      
      // Обрабатываем все пиксели без сэмплирования для точного подсчета
      console.log(`Object ${objectIndex + 1} processing all pixels (${area} total)`);
      let pixelsInObject = 0;
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let x = bounds.minX; x <= bounds.maxX; x++) {
          if (isPointInPolygon(x, y, naturalPath)) {
            const pixelKey = `${x},${y}`;
            // Считаем пиксель для текущего объекта независимо
            objectPixelCounts[objectIndex]++;
            pixelsInObject++;
            // Добавляем в общий набор только если пиксель еще не был добавлен другим объектом
            if (!allPixels.has(pixelKey)) {
              allPixels.add(pixelKey);
              pixelToObject.set(pixelKey, objectIndex);
            }
          }
        }
      }
      console.log(`Object ${objectIndex + 1} found ${pixelsInObject} pixels inside polygon`);
      
      console.log(`Object ${objectIndex + 1} processed: ${objectPixelCounts[objectIndex]} pixels`);
    });
    
    console.log('Total unique pixels collected:', allPixels.size);
    console.log('Object pixel counts:', objectPixelCounts);
    
    // Теперь собираем цветовые данные для всех уникальных пикселей
    const allPixelColors = [];
    const pixelObjectMapping = [];
    
    allPixels.forEach(pixelKey => {
      const [x, y] = pixelKey.split(',').map(Number);
      const imageData = tempCtx.getImageData(x, y, 1, 1).data;
      
      if (imageData[3] >= 128) { // Непрозрачные пиксели
        allPixelColors.push([imageData[0], imageData[1], imageData[2]]);
        pixelObjectMapping.push(pixelToObject.get(pixelKey));
      }
    });
    
    console.log('Total valid pixel colors:', allPixelColors.length);
    
    if (allPixelColors.length === 0) {
      result.innerHTML = '<div style="color:#e53e3e">No valid pixels in selected objects</div>';
      return;
    }
    
    // Анализируем все пиксели вместе
    const analysisResult = analyzeSingleObject(allPixelColors, 'all');
    console.log('Combined analysis result:', analysisResult);
    
    if (!analysisResult) {
      result.innerHTML = '<div style="color:#e53e3e">Analysis failed</div>';
      return;
    }
    
    // Создаем результаты для каждого объекта на основе общего анализа
    const objectResults = [];
    selectedObjects.forEach((object, objectIndex) => {
      const objectPixels = [];
      const objectPixelIndices = [];
      
      // Собираем пиксели этого объекта
      pixelObjectMapping.forEach((objIndex, pixelIndex) => {
        if (objIndex === objectIndex) {
          objectPixels.push(allPixelColors[pixelIndex]);
          objectPixelIndices.push(pixelIndex);
        }
      });
      
      if (objectPixels.length > 0) {
        // Определяем доминирующий цвет для этого объекта
        const objectColorCounts = new Array(analysisResult.allColors.length).fill(0);
        
        objectPixels.forEach(pixel => {
          let minDist = Infinity, idx = 0;
          for (let j = 0; j < analysisResult.allColors.length; j++) {
            const dist = colorDist(pixel, analysisResult.allColors[j]);
            if (dist < minDist) {
              minDist = dist;
              idx = j;
            }
          }
          objectColorCounts[idx]++;
        });
        
        const dominantIndex = objectColorCounts.indexOf(Math.max(...objectColorCounts));
        
        objectResults.push({
          objectId: objectIndex + 1,
          dominantColor: analysisResult.allColors[dominantIndex],
          dominantName: analysisResult.allNames[dominantIndex],
          dominantPercent: Math.round((objectColorCounts[dominantIndex] / objectPixels.length) * 100),
          dominantPixels: objectColorCounts[dominantIndex],
          totalPixels: objectPixels.length,
          allColors: analysisResult.allColors,
          allNames: analysisResult.allNames,
          allPercents: analysisResult.allPercents,
          allCounts: analysisResult.allCounts
        });
      }
    });
    
    console.log('Final object results:', objectResults);
    
    // Отображаем результаты
    displayObjectResults(objectResults);
    
  } catch (error) {
    console.error('Error during object analysis:', error);
    console.error('Error stack:', error.stack);
    result.innerHTML = `<div style="color:#e53e3e">Error during analysis: ${error.message}. Please try with smaller objects or fewer objects.</div>`;
  }
}

// Новая функция для независимого анализа объектов в Spot Mode
function analyzeSelectedObjectsIndependent() {
  console.log('Analyzing objects independently:', selectedObjects.length);
  console.log('Selected objects:', selectedObjects);
  
  if (selectedObjects.length === 0) {
    result.innerHTML = '<div style="color:#e53e3e">No objects selected. Please draw around objects first.</div>';
    return;
  }
  
  // Ограничиваем количество объектов для производительности
  const maxObjects = 50;
  if (selectedObjects.length > maxObjects) {
    result.innerHTML = `<div style="color:#e53e3e">Too many objects (${selectedObjects.length}). Please select no more than ${maxObjects} objects.</div>`;
    return;
  }
  
  // Создаем временный canvas для анализа
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = preview.naturalWidth;
  tempCanvas.height = preview.naturalHeight;
  
  // Рисуем изображение на временном canvas
  tempCtx.drawImage(preview, 0, 0);
  
  // Конвертируем координаты из отображаемого размера в натуральный
  const scaleX = preview.naturalWidth / preview.offsetWidth;
  const scaleY = preview.naturalHeight / preview.offsetHeight;
  
  console.log('Scale factors:', { scaleX, scaleY });
  
  // Проверяем валидность размеров
  if (!preview.naturalWidth || !preview.naturalHeight || !preview.offsetWidth || !preview.offsetHeight) {
    console.error('Invalid preview dimensions');
    result.innerHTML = '<div style="color:#e53e3e">Invalid image dimensions</div>';
    return;
  }
  
  try {
    // Анализируем каждый объект независимо
    const objectResults = [];
    
    selectedObjects.forEach((object, objectIndex) => {
      console.log(`Processing object ${objectIndex + 1} independently:`, object);
      
      if (!object.path || object.path.length < 3) {
        console.error(`Object ${objectIndex + 1} has invalid path:`, object.path);
        return;
      }
      
      // Создаем путь для проверки попадания пикселей
      const naturalPath = object.path.map(point => ({
        x: Math.round(point.x * scaleX),
        y: Math.round(point.y * scaleY)
      }));
      
      console.log('Natural path:', naturalPath);
      
      // Получаем границы объекта
      const bounds = getPathBounds(naturalPath);
      const width = bounds.maxX - bounds.minX + 1;
      const height = bounds.maxY - bounds.minY + 1;
      const maxPixels = 25000;
      const area = width * height;
      const objectPixels = [];

      // Получаем сразу все пиксели в bounding box одним вызовом
      const imageData = tempCtx.getImageData(bounds.minX, bounds.minY, width, height).data;

      if (area > maxPixels) {
        // Для больших объектов используем сэмплирование
        const stepX = Math.max(1, Math.floor(width / Math.sqrt(maxPixels)));
        const stepY = Math.max(1, Math.floor(height / Math.sqrt(maxPixels)));
        for (let y = 0; y < height; y += stepY) {
          for (let x = 0; x < width; x += stepX) {
            const canvasX = bounds.minX + x;
            const canvasY = bounds.minY + y;
            if (isPointInPolygon(canvasX, canvasY, naturalPath)) {
              const idx = (y * width + x) * 4;
              const r = imageData[idx];
              const g = imageData[idx + 1];
              const b = imageData[idx + 2];
              const a = imageData[idx + 3];
              if (a >= 128) {
                objectPixels.push([r, g, b]);
              }
            }
          }
        }
      } else {
        // Для маленьких объектов обрабатываем все пиксели
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const canvasX = bounds.minX + x;
            const canvasY = bounds.minY + y;
            if (isPointInPolygon(canvasX, canvasY, naturalPath)) {
              const idx = (y * width + x) * 4;
              const r = imageData[idx];
              const g = imageData[idx + 1];
              const b = imageData[idx + 2];
              const a = imageData[idx + 3];
              if (a >= 128) {
                objectPixels.push([r, g, b]);
              }
            }
          }
        }
      }
      
      console.log(`Object ${objectIndex + 1} has ${objectPixels.length} pixels`);
      
      if (objectPixels.length > 0) {
        // Анализируем этот объект независимо
        const analysisResult = analyzeSingleObject(objectPixels, objectIndex + 1);
        
        if (analysisResult) {
          objectResults.push({
            objectId: objectIndex + 1,
            dominantColor: analysisResult.dominantColor,
            dominantName: analysisResult.dominantName,
            dominantPercent: analysisResult.dominantPercent,
            dominantPixels: analysisResult.dominantPixels,
            totalPixels: objectPixels.length,
            allColors: analysisResult.allColors,
            allNames: analysisResult.allNames,
            allPercents: analysisResult.allPercents,
            allCounts: analysisResult.allCounts
          });
        }
      }
    });
    
    console.log('Independent object results:', objectResults);
    
    if (objectResults.length === 0) {
      result.innerHTML = '<div style="color:#e53e3e">No valid objects found</div>';
      return;
    }
    
    // Сохраняем результаты для оптимизации
    lastAnalysisResults = objectResults;
    
    // Отображаем результаты
    displayObjectResultsIndependent(objectResults);
    
    // Показываем кнопку оптимизации
    const optimizeBtn = document.getElementById('optimizeColors');
    if (optimizeBtn) {
      optimizeBtn.style.display = 'inline-block';
    }
    
  } catch (error) {
    console.error('Error during independent object analysis:', error);
    console.error('Error stack:', error.stack);
    result.innerHTML = `<div style="color:#e53e3e">Error during analysis: ${error.message}. Please try with smaller objects or fewer objects.</div>`;
  }
}

function getPathBounds(path) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  path.forEach(point => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  
  return { minX, minY, maxX, maxY };
}

function isPointInPolygon(x, y, polygon) {
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

function analyzeSingleObject(pixels, objectId) {
  // Проверяем входные данные
  if (!pixels || pixels.length === 0) {
    console.error(`Object ${objectId} has no pixels`);
    return null;
  }
  
  // Используем улучшенный алгоритм с фиксированной палитрой для Interactive Selection
  console.log(`Analyzing ${pixels.length} pixels with Enhanced Fixed Palette algorithm`);
  
  // Расширенная палитра с четким разделением цветов
  const baseColors = [
    // Основные цвета (высокий приоритет)
    [255, 0, 0],      // Red
    [0, 255, 0],      // Green
    [0, 0, 255],      // Blue
    [255, 255, 0],    // Yellow
    [255, 0, 255],    // Magenta
    [0, 255, 255],    // Cyan
    
    // Оранжевые оттенки
    [255, 165, 0],    // Orange
    [255, 140, 0],    // Dark Orange
    [255, 69, 0],     // Red Orange
    [255, 99, 71],    // Tomato
    
    // Розовые оттенки
    [255, 192, 203],  // Pink
    [255, 20, 147],   // Deep Pink
    [219, 112, 147],  // Pale Violet Red
    [255, 105, 180],  // Hot Pink
    
    // Фиолетовые оттенки
    [128, 0, 128],    // Purple
    [75, 0, 130],     // Indigo
    [138, 43, 226],   // Blue Violet
    [147, 112, 219],  // Medium Purple
    
    // Зеленые оттенки
    [34, 139, 34],    // Forest Green
    [0, 128, 0],      // Green
    [50, 205, 50],    // Lime Green
    [144, 238, 144],  // Light Green
    [0, 255, 127],    // Spring Green
    [46, 139, 87],    // Sea Green
    
    // Синие оттенки
    [0, 0, 139],      // Dark Blue
    [70, 130, 180],   // Steel Blue
    [135, 206, 235],  // Sky Blue
    [173, 216, 230],  // Light Blue
    [100, 149, 237],  // Cornflower Blue
    [30, 144, 255],   // Dodger Blue
    
    // Красные оттенки
    [139, 0, 0],      // Dark Red
    [220, 20, 60],    // Crimson
    [178, 34, 34],    // Fire Brick
    [255, 160, 122],  // Light Salmon
    [255, 69, 0],     // Red Orange
    [255, 0, 0],      // Pure Red
    
    // Желтые оттенки
    [255, 215, 0],    // Gold
    [218, 165, 32],   // Golden Rod
    [255, 255, 224],  // Light Yellow
    [255, 255, 0],    // Pure Yellow
    
    // Коричневые оттенки
    [139, 69, 19],    // Saddle Brown
    [160, 82, 45],    // Sienna
    [210, 105, 30],   // Chocolate
    [244, 164, 96],   // Sandy Brown
    [165, 42, 42],    // Brown
    
    // Ограниченные серые оттенки (пониженный приоритет)
    [128, 128, 128],  // Gray
    [169, 169, 169],  // Dark Gray
    [192, 192, 192],  // Silver
    [211, 211, 211],  // Light Gray
    
    // Ограниченные белый и черный (минимальный приоритет)
    [255, 255, 255],  // White
    [0, 0, 0]         // Black
  ];
  
  const colorNames = [
    'Red', 'Green', 'Blue', 'Yellow', 'Magenta', 'Cyan',
    'Orange', 'Dark Orange', 'Red Orange', 'Tomato',
    'Pink', 'Deep Pink', 'Pale Violet Red', 'Hot Pink',
    'Purple', 'Indigo', 'Blue Violet', 'Medium Purple',
    'Forest Green', 'Green', 'Lime Green', 'Light Green', 'Spring Green', 'Sea Green',
    'Dark Blue', 'Steel Blue', 'Sky Blue', 'Light Blue', 'Cornflower Blue', 'Dodger Blue',
    'Dark Red', 'Crimson', 'Fire Brick', 'Light Salmon', 'Red Orange', 'Pure Red',
    'Gold', 'Golden Rod', 'Light Yellow', 'Pure Yellow',
    'Saddle Brown', 'Sienna', 'Chocolate', 'Sandy Brown', 'Brown',
    'Gray', 'Dark Gray', 'Silver', 'Light Gray',
    'White', 'Black'
  ];
  
  const counts = new Array(baseColors.length).fill(0);
  
  // Анализируем каждый пиксель
  const pixelCount = pixels.length;
  const sampleSize = Math.min(pixelCount, 10000);
  
  if (pixelCount > sampleSize) {
    console.log(`Sampling ${sampleSize} pixels from ${pixelCount} total pixels`);
    const step = Math.floor(pixelCount / sampleSize);
    for (let i = 0; i < pixelCount; i += step) {
      const pixel = pixels[i];
      
      // Проверяем валидность пикселя
      if (!pixel || !Array.isArray(pixel) || pixel.length < 3) {
        console.warn(`Invalid pixel at index ${i}:`, pixel);
        continue;
      }
      
      // Находим ближайший базовый цвет
      let minDist = Infinity, idx = 0;
      for (let j = 0; j < baseColors.length; j++) {
        const dist = colorDist(pixel, baseColors[j]);
        if (dist < minDist) {
          minDist = dist;
          idx = j;
        }
      }
      
      // Применяем вес в зависимости от типа цвета
      const isBWG = isBWorGray(baseColors[idx]);
      let weight = 1.0;
      
      if (isBWG) {
        // Проверяем, является ли это черным цветом
        const [r, g, b] = baseColors[idx];
        if (r < 30 && g < 30 && b < 30) {
          weight = 0.1; // Черный - очень низкий вес
        } else if (r > 200 && g > 200 && b > 200) {
          weight = 0.15; // Белый - очень низкий вес
        } else {
          weight = 0.2; // Серый - низкий вес
        }
      }
      
      counts[idx] += weight;
    }
  } else {
    // Для маленьких объектов анализируем все пиксели
    for (const pixel of pixels) {
      // Проверяем валидность пикселя
      if (!pixel || !Array.isArray(pixel) || pixel.length < 3) {
        console.warn('Invalid pixel in small object loop:', pixel);
        continue;
      }
      
      // Находим ближайший базовый цвет
      let minDist = Infinity, idx = 0;
      for (let j = 0; j < baseColors.length; j++) {
        const dist = colorDist(pixel, baseColors[j]);
        if (dist < minDist) {
          minDist = dist;
          idx = j;
        }
      }
      
      // Применяем вес в зависимости от типа цвета
      const isBWG = isBWorGray(baseColors[idx]);
      let weight = 1.0;
      
      if (isBWG) {
        // Проверяем, является ли это черным цветом
        const [r, g, b] = baseColors[idx];
        if (r < 30 && g < 30 && b < 30) {
          weight = 0.1; // Черный - очень низкий вес
        } else if (r > 200 && g > 200 && b > 200) {
          weight = 0.15; // Белый - очень низкий вес
        } else {
          weight = 0.2; // Серый - низкий вес
        }
      }
      
      counts[idx] += weight;
    }
  }
  
  const total = counts.reduce((a, b) => a + b, 0);
  const percents = counts.map(c => Math.round((c / total) * 100));
  const totalPixels = pixels.length;
  
  // Сортируем по проценту и берем топ-3
  const sortedIndices = percents
    .map((percent, index) => ({ percent, index }))
    .sort((a, b) => b.percent - a.percent);
  
  const topColors = [];
  const topNames = [];
  const topPercents = [];
  const topCounts = [];
  
  // Берем топ-3 цвета
  for (let i = 0; i < Math.min(3, sortedIndices.length); i++) {
    const index = sortedIndices[i].index;
    topColors.push(baseColors[index]);
    topNames.push(colorNames[index]);
    topPercents.push(percents[index]);
    topCounts.push(Math.round(counts[index]));
  }
  
  // Определяем доминирующий цвет (первый в топ-3)
  let dominantIndex = 0;
  
  // Если доминирующий цвет - BWG, ищем следующий по величине цветной
  if (topColors.length > 0 && isBWorGray(topColors[0])) {
    // Ищем цветной цвет с наибольшим процентом в топ-3
    let maxColoredPercent = 0;
    let maxColoredIndex = 0; // fallback на первый если нет цветных
    
    for (let i = 0; i < topColors.length; i++) {
      if (!isBWorGray(topColors[i]) && topPercents[i] > maxColoredPercent) {
        maxColoredPercent = topPercents[i];
        maxColoredIndex = i;
      }
    }
    
    // Если нашли цветной цвет с достаточным процентом (>10%), используем его
    if (maxColoredPercent > 10) {
      dominantIndex = maxColoredIndex;
    }
    // Иначе оставляем BWG как доминирующий
  }
  
  return {
    objectId: objectId,
    dominantColor: topColors[dominantIndex],
    dominantName: topNames[dominantIndex],
    dominantPercent: topPercents[dominantIndex],
    dominantPixels: topCounts[dominantIndex] || 0,
    totalPixels: totalPixels,
    allColors: topColors,
    allNames: topNames,
    allPercents: topPercents,
    allCounts: topCounts
  };
}

function displayObjectResults(objectResults) {
  // Проверяем входные данные
  if (!objectResults || objectResults.length === 0) {
    console.error('displayObjectResults: No results to display');
    result.innerHTML = '<div style="color:#e53e3e">No analysis results to display</div>';
    return;
  }
  
  console.log('displayObjectResults called with:', objectResults);
  
  let html = '<div style="margin-bottom:12px;color:#3b82f6;font-weight:500;">Color Distribution Analysis (by Total Selected Pixels):</div>';
  
  // Группируем объекты по доминирующим цветам и считаем общее количество пикселей
  const colorGroups = {};
  let totalPixels = 0;
  
  objectResults.forEach(result => {
    const colorName = result.dominantName;
    if (!colorGroups[colorName]) {
      colorGroups[colorName] = {
        color: result.dominantColor,
        objects: [],
        totalPixels: 0
      };
    }
    colorGroups[colorName].objects.push(result);
    // Добавляем общее количество пикселей этого объекта (не только доминирующего цвета)
    colorGroups[colorName].totalPixels += result.totalPixels;
    totalPixels += result.totalPixels;
  });
  
  // Сортируем группы по количеству пикселей
  const sortedGroups = Object.entries(colorGroups).sort((a, b) => b[1].totalPixels - a[1].totalPixels);
  
  // Показываем общую цветовую полосу
  html += '<div class="color-bar" style="height:40px;margin-bottom:16px;">';
  
  sortedGroups.forEach(([colorName, group]) => {
    const groupPercent = Math.round((group.totalPixels / totalPixels) * 100);
    html += `<div class="color-segment" style="width:${groupPercent}%;background:${rgbToHex(group.color)};position:relative;">`;
    html += `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-weight:bold;text-shadow:1px 1px 2px rgba(0,0,0,0.7);">${colorName}</div>`;
    html += `</div>`;
  });
  html += '</div>';
  
  // Показываем детальную информацию
  html += '<ul class="color-list">';
  sortedGroups.forEach(([colorName, group]) => {
    const groupPercent = Math.round((group.totalPixels / totalPixels) * 100);
    const objectCount = group.objects.length;
    
    html += `<li style="margin-bottom:12px;">`;
    html += `<span class="color-dot" style="background:${rgbToHex(group.color)};width:20px;height:20px;"></span>`;
    html += `<b>${groupPercent}%</b> <span style="color:#3b82f6;font-weight:500;margin-left:4px;">(${colorName})</span>`;
    html += `<span style="color:#7a869a;font-size:0.98em;margin-left:2px;">${rgbToHex(group.color)}</span>`;
    html += `<span style="color:#6b7280;font-size:0.9em;margin-left:2px;">- ${group.totalPixels} total pixels, ${objectCount} object${objectCount > 1 ? 's' : ''}</span>`;
    html += `</li>`;
  });
  html += '</ul>';
  
  // Показываем сравнение с идеальным распределением
  const topColor = sortedGroups[0];
  const secondColor = sortedGroups[1];
  const thirdColor = sortedGroups[2];
  
  html += `<div class="ideal" style="margin-top:16px;">`;
  html += `<div style="margin-bottom:2px;"><b>Current Distribution (by pixels):</b></div>`;
  if (topColor) html += `<div>Primary: <b>${topColor[0]}</b> (${Math.round((topColor[1].totalPixels / totalPixels) * 100)}%)</div>`;
  if (secondColor) html += `<div>Secondary: <b>${secondColor[0]}</b> (${Math.round((secondColor[1].totalPixels / totalPixels) * 100)}%)</div>`;
  if (thirdColor) html += `<div>Accent: <b>${thirdColor[0]}</b> (${Math.round((thirdColor[1].totalPixels / totalPixels) * 100)}%)</div>`;
  html += `</div>`;
  
  result.innerHTML = html;
}

// Новая функция отображения для независимого анализа
function displayObjectResultsIndependent(objectResults) {
  // Проверяем входные данные
  if (!objectResults || objectResults.length === 0) {
    console.error('displayObjectResultsIndependent: No results to display');
    result.innerHTML = '<div style="color:#e53e3e">No analysis results to display</div>';
    return;
  }
  
  console.log('displayObjectResultsIndependent called with:', objectResults);
  
  let html = '<div style="margin-bottom:12px;color: #6b7280;font-weight:500;">Independent Object Analysis (each object analyzed separately):</div>';
  
  // Группируем объекты по доминирующим цветам
  const colorGroups = {};
  let totalPixels = 0;
  
  objectResults.forEach(result => {
    const colorName = result.dominantName;
    if (!colorGroups[colorName]) {
      colorGroups[colorName] = {
        color: result.dominantColor,
        objects: [],
        totalPixels: 0
      };
    }
    colorGroups[colorName].objects.push(result);
    colorGroups[colorName].totalPixels += result.totalPixels;
    totalPixels += result.totalPixels;
  });
  
  // Сортируем группы по количеству пикселей
  const sortedGroups = Object.entries(colorGroups).sort((a, b) => b[1].totalPixels - a[1].totalPixels);
  
  // Показываем общую цветовую полосу
  html += '<div class="color-bar" style="height:40px;margin-bottom:16px;">';
  
  sortedGroups.forEach(([colorName, group]) => {
    const groupPercent = Math.round((group.totalPixels / totalPixels) * 100);
    html += `<div class="color-segment" style="width:${groupPercent}%;background:${rgbToHex(group.color)};position:relative;">`;
    html += `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-weight:bold;text-shadow:1px 1px 2px rgba(0,0,0,0.7);">${colorName}</div>`;
    html += `</div>`;
  });
  html += '</div>';
  
  // Показываем детальную информацию
  html += '<ul class="color-list">';
  sortedGroups.forEach(([colorName, group]) => {
    const groupPercent = Math.round((group.totalPixels / totalPixels) * 100);
    const objectCount = group.objects.length;
    
    html += `<li style="margin-bottom:12px;">`;
    html += `<span class="color-dot" style="background:${rgbToHex(group.color)};width:20px;height:20px;"></span>`;
    html += `<b>${groupPercent}%</b> <span style="color:#3b82f6;font-weight:500;margin-left:4px;">(${colorName})</span>`;
    html += `<span style="color:#7a869a;font-size:0.98em;margin-left:8px;">${rgbToHex(group.color)}</span>`;
    html += `<span style="color:#6b7280;font-size:0.9em;margin-left:8px;">- ${group.totalPixels} total pixels, ${objectCount} object${objectCount > 1 ? 's' : ''}</span>`;
    html += `</li>`;
  });
  html += '</ul>';
  
  // Показываем сравнение с идеальным распределением
  const topColor = sortedGroups[0];
  const secondColor = sortedGroups[1];
  const thirdColor = sortedGroups[2];
  
  html += `<div class="ideal" style="margin-top:16px;">`;
  html += `<div style="margin-bottom:8px;"><b>Current Distribution (by pixels):</b></div>`;
  if (topColor) html += `<div>Primary: <b>${topColor[0]}</b> (${Math.round((topColor[1].totalPixels / totalPixels) * 100)}%)</div>`;
  if (secondColor) html += `<div>Secondary: <b>${secondColor[0]}</b> (${Math.round((secondColor[1].totalPixels / totalPixels) * 100)}%)</div>`;
  if (thirdColor) html += `<div>Accent: <b>${thirdColor[0]}</b> (${Math.round((thirdColor[1].totalPixels / totalPixels) * 100)}%)</div>`;
  html += `</div>`;
  
  result.innerHTML = html;
}

// Функция для оптимизации цветов к топ-3 доминирующим
function optimizeColorsToTop3() {
  if (!lastAnalysisResults || lastAnalysisResults.length === 0) {
    result.innerHTML = '<div style="color:#e53e3e">No analysis results to optimize. Please analyze objects first.</div>';
    return;
  }
  
  console.log('Optimizing colors to top-3:', lastAnalysisResults);
  
  // Группируем объекты по доминирующим цветам
  const colorGroups = {};
  let totalPixels = 0;
  
  lastAnalysisResults.forEach(result => {
    const colorName = result.dominantName;
    if (!colorGroups[colorName]) {
      colorGroups[colorName] = {
        color: result.dominantColor,
        objects: [],
        totalPixels: 0
      };
    }
    colorGroups[colorName].objects.push(result);
    colorGroups[colorName].totalPixels += result.totalPixels;
    totalPixels += result.totalPixels;
  });
  
  // Сортируем группы по количеству пикселей
  const sortedGroups = Object.entries(colorGroups).sort((a, b) => b[1].totalPixels - a[1].totalPixels);
  
  // Получаем топ-3 цвета
  const top3Colors = sortedGroups.slice(0, 3);
  
  if (top3Colors.length === 0) {
    result.innerHTML = '<div style="color:#e53e3e">No colors found to optimize.</div>';
    return;
  }
  
  console.log('Top-3 colors:', top3Colors);
  
  // Создаем оптимизированные результаты
  const optimizedResults = [];
  
  lastAnalysisResults.forEach(result => {
    const currentColorName = result.dominantName;
    const currentColor = result.dominantColor;
    
    // Проверяем, входит ли текущий цвет в топ-3
    const isInTop3 = top3Colors.some(([colorName, group]) => colorName === currentColorName);
    
    if (isInTop3) {
      // Если цвет уже в топ-3, оставляем как есть
      optimizedResults.push({
        ...result,
        originalColor: currentColorName,
        optimizedColor: currentColorName,
        wasOptimized: false
      });
    } else {
      // Если цвет не в топ-3, находим ближайший из топ-3
      let minDist = Infinity;
      let closestColor = null;
      let closestColorName = null;
      
      top3Colors.forEach(([colorName, group]) => {
        const dist = colorDist(currentColor, group.color);
        if (dist < minDist) {
          minDist = dist;
          closestColor = group.color;
          closestColorName = colorName;
        }
      });
      
      // Перераспределяем объект к ближайшему цвету из топ-3
      optimizedResults.push({
        ...result,
        dominantColor: closestColor,
        dominantName: closestColorName,
        originalColor: currentColorName,
        optimizedColor: closestColorName,
        wasOptimized: true
      });
    }
  });
  
  console.log('Optimized results:', optimizedResults);
  
  // Отображаем оптимизированные результаты
  displayOptimizedResults(optimizedResults, top3Colors);
}

// Функция отображения оптимизированных результатов
function displayOptimizedResults(optimizedResults, top3Colors) {
  // Группируем объекты по оптимизированным цветам
  const colorGroups = {};
  let totalPixels = 0;
  
  optimizedResults.forEach(result => {
    const colorName = result.optimizedColor;
    if (!colorGroups[colorName]) {
      colorGroups[colorName] = {
        color: result.dominantColor,
        objects: [],
        totalPixels: 0,
        originalColors: new Set()
      };
    }
    colorGroups[colorName].objects.push(result);
    colorGroups[colorName].totalPixels += result.totalPixels;
    colorGroups[colorName].originalColors.add(result.originalColor);
    totalPixels += result.totalPixels;
  });
  
  // Сортируем группы по количеству пикселей
  const sortedGroups = Object.entries(colorGroups).sort((a, b) => b[1].totalPixels - a[1].totalPixels);
  
  let html = '<div style="margin-bottom:12px;color:#6b7280;font-weight:500;">Optimized to Top-3 Colors (60/30/10 Rule):</div>';
  
  // Показываем общую цветовую полосу
  html += '<div class="color-bar" style="height:40px;margin-bottom:16px;">';
  
  sortedGroups.forEach(([colorName, group]) => {
    const groupPercent = Math.round((group.totalPixels / totalPixels) * 100);
    html += `<div class="color-segment" style="width:${groupPercent}%;background:${rgbToHex(group.color)};position:relative;">`;
    html += `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-weight:bold;text-shadow:1px 1px 2px rgba(0,0,0,0.7);">${colorName}</div>`;
    html += `</div>`;
  });
  html += '</div>';
  
  // Показываем детальную информацию
  html += '<ul class="color-list">';
  sortedGroups.forEach(([colorName, group]) => {
    const groupPercent = Math.round((group.totalPixels / totalPixels) * 100);
    const objectCount = group.objects.length;
    const optimizedCount = group.objects.filter(obj => obj.wasOptimized).length;
    
    html += `<li style="margin-bottom:12px;">`;
    html += `<span class="color-dot" style="background:${rgbToHex(group.color)};width:20px;height:20px;"></span>`;
    html += `<b>${groupPercent}%</b> <span style="color:#8b5cf6;font-weight:500;margin-left:4px;">(${colorName})</span>`;
    html += `<span style="color:#7a869a;font-size:0.98em;margin-left:8px;">${rgbToHex(group.color)}</span>`;
    html += `<span style="color:#6b7280;font-size:0.9em;margin-left:8px;">- ${group.totalPixels} total pixels, ${objectCount} object${objectCount > 1 ? 's' : ''}`;
    if (optimizedCount > 0) {
      html += ` <span style="color:#f59e0b;font-weight:500;">(${optimizedCount} optimized)</span>`;
    }
    html += `</span>`;
    html += `</li>`;
  });
  html += '</ul>';
  
  // Показываем статистику оптимизации
  const optimizedCount = optimizedResults.filter(r => r.wasOptimized).length;
  const totalObjects = optimizedResults.length;
  
  html += `<div class="ideal" style="margin-top:16px;">`;
  html += `<div style="margin-bottom:8px;"><b>Optimization Summary:</b></div>`;
  html += `<div>Objects optimized: <b>${optimizedCount}/${totalObjects}</b></div>`;
  html += `<div>Colors reduced to: <b>${sortedGroups.length}</b> (from ${Object.keys(colorGroups).length})</div>`;
  
  // Показываем соответствие правилу 60/30/10
  const topColor = sortedGroups[0];
  const secondColor = sortedGroups[1];
  const thirdColor = sortedGroups[2];
  

  
  result.innerHTML = html;
}

// Функция для анализа Spot Mode X с ручным связыванием
function analyzeSpotModeXManual() {
  if (selectedObjects.length === 0) {
    result.innerHTML = '<div style="color:#e53e3e">No objects selected. Please draw around objects first.</div>';
    return;
  }
  
  // Получаем выбранные цвета
  const primaryColor = document.getElementById('primaryColorBtn').dataset.color;
  const secondaryColor = document.getElementById('secondaryColorBtn').dataset.color;
  const accentColor = document.getElementById('accentColorBtn').dataset.color;
  
  const primaryName = document.getElementById('primaryColorName').value || 'Primary';
  const secondaryName = document.getElementById('secondaryColorName').value || 'Secondary';
  const accentName = document.getElementById('accentColorName').value || 'Accent';
  
  console.log('Spot Mode X Manual colors:', { primaryColor, secondaryColor, accentColor });
  
  // Конвертируем hex в RGB
  const primaryRGB = hexToRgb(primaryColor);
  const secondaryRGB = hexToRgb(secondaryColor);
  const accentRGB = hexToRgb(accentColor);
  
  if (!primaryRGB || !secondaryRGB || !accentRGB) {
    result.innerHTML = '<div style="color:#e53e3e">Invalid color values</div>';
    return;
  }
  
  // Создаем временный canvas для анализа
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = preview.naturalWidth;
  tempCanvas.height = preview.naturalHeight;
  
  // Рисуем изображение на временном canvas
  tempCtx.drawImage(preview, 0, 0);
  
  // Конвертируем координаты из отображаемого размера в натуральный
  const scaleX = preview.naturalWidth / preview.offsetWidth;
  const scaleY = preview.naturalHeight / preview.offsetHeight;
  
  try {
    // Анализируем каждый объект
    const objectResults = [];
    let totalPixels = 0;
    
    selectedObjects.forEach((object, objectIndex) => {
      if (!object.path || object.path.length < 3) {
        return;
      }
      
      // Создаем путь для проверки попадания пикселей
      const naturalPath = object.path.map(point => ({
        x: Math.round(point.x * scaleX),
        y: Math.round(point.y * scaleY)
      }));
      
      // Получаем границы объекта
      const bounds = getPathBounds(naturalPath);
      
      // Собираем пиксели этого объекта
      const objectPixels = [];
      const maxPixels = 25000;
      const area = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
      
      if (area > maxPixels) {
        // Для больших объектов используем сэмплирование
        const stepX = Math.max(1, Math.floor((bounds.maxX - bounds.minX) / Math.sqrt(maxPixels)));
        const stepY = Math.max(1, Math.floor((bounds.maxY - bounds.minY) / Math.sqrt(maxPixels)));
        
        for (let y = bounds.minY; y <= bounds.maxY; y += stepY) {
          for (let x = bounds.minX; x <= bounds.maxX; x += stepX) {
            if (isPointInPolygon(x, y, naturalPath)) {
              const imageData = tempCtx.getImageData(x, y, 1, 1).data;
              if (imageData[3] >= 128) {
                objectPixels.push([imageData[0], imageData[1], imageData[2]]);
              }
            }
          }
        }
      } else {
        // Для маленьких объектов обрабатываем все пиксели
        for (let y = bounds.minY; y <= bounds.maxY; y++) {
          for (let x = bounds.minX; x <= bounds.maxX; x++) {
            if (isPointInPolygon(x, y, naturalPath)) {
              const imageData = tempCtx.getImageData(x, y, 1, 1).data;
              if (imageData[3] >= 128) {
                objectPixels.push([imageData[0], imageData[1], imageData[2]]);
              }
            }
          }
        }
      }
      
      if (objectPixels.length > 0) {
        // Определяем средний цвет объекта
        const avgColor = calculateAverageColor(objectPixels);
        
        // Проверяем, есть ли ручное назначение цвета для этого объекта
        const objectId = objectIndex + 1;
        const manualAssignment = objectColorAssignments.get(objectId);
        
        let assignedColor, assignedName, assignedType;
        
        if (manualAssignment) {
          // Используем ручное назначение
          switch (manualAssignment) {
            case 'primary':
              assignedColor = primaryRGB;
              assignedName = primaryName;
              assignedType = 'primary';
              break;
            case 'secondary':
              assignedColor = secondaryRGB;
              assignedName = secondaryName;
              assignedType = 'secondary';
              break;
            case 'accent':
              assignedColor = accentRGB;
              assignedName = accentName;
              assignedType = 'accent';
              break;
          }
        } else {
          // Автоматическое назначение по ближайшему цвету
          const distances = [
            { color: primaryRGB, name: primaryName, type: 'primary' },
            { color: secondaryRGB, name: secondaryName, type: 'secondary' },
            { color: accentRGB, name: accentName, type: 'accent' }
          ].map(item => ({
            ...item,
            distance: colorDist(avgColor, item.color)
          }));
          
          distances.sort((a, b) => a.distance - b.distance);
          const closestColor = distances[0];
          assignedColor = closestColor.color;
          assignedName = closestColor.name;
          assignedType = closestColor.type;
        }
        
        objectResults.push({
          objectId: objectId,
          totalPixels: objectPixels.length,
          averageColor: avgColor,
          assignedColor: assignedColor,
          assignedName: assignedName,
          assignedType: assignedType,
          colorDistance: colorDist(avgColor, assignedColor),
          isManualAssignment: !!manualAssignment
        });
        
        totalPixels += objectPixels.length;
      }
    });
    
    console.log('Spot Mode X Manual results:', objectResults);
    
    if (objectResults.length === 0) {
      result.innerHTML = '<div style="color:#e53e3e">No valid objects found</div>';
      return;
    }
    
    // Сохраняем результаты для последующего использования
    lastAnalysisResults = {
      objectResults,
      totalPixels,
      selectedColors: {
        primary: { color: primaryRGB, name: primaryName },
        secondary: { color: secondaryRGB, name: secondaryName },
        accent: { color: accentRGB, name: accentName }
      }
    };
    
    // Отображаем результаты с возможностью ручного связывания
    displaySpotModeXManualResults(objectResults, totalPixels, {
      primary: { color: primaryRGB, name: primaryName },
      secondary: { color: secondaryRGB, name: secondaryName },
      accent: { color: accentRGB, name: accentName }
    });
    
  } catch (error) {
    console.error('Error during Spot Mode X Manual analysis:', error);
    result.innerHTML = `<div style="color:#e53e3e">Error during analysis: ${error.message}</div>`;
  }
}

// Функция для ручного назначения цвета объекту
function assignColorToObject(objectId, colorType) {
  objectColorAssignments.set(objectId, colorType);
  console.log(`Assigned ${colorType} color to Object ${objectId}`);
  
  // Если есть результаты анализа, обновляем отображение
  if (lastAnalysisResults) {
    // Обновляем результаты с учетом ручных назначений
    const updatedResults = lastAnalysisResults.objectResults.map(result => {
      const manualAssignment = objectColorAssignments.get(result.objectId);
      if (manualAssignment) {
        // Применяем ручное назначение
        const selectedColors = lastAnalysisResults.selectedColors;
        let assignedColor, assignedName, assignedType;
        
        switch (manualAssignment) {
          case 'primary':
            assignedColor = selectedColors.primary.color;
            assignedName = selectedColors.primary.name;
            assignedType = 'primary';
            break;
          case 'secondary':
            assignedColor = selectedColors.secondary.color;
            assignedName = selectedColors.secondary.name;
            assignedType = 'secondary';
            break;
          case 'accent':
            assignedColor = selectedColors.accent.color;
            assignedName = selectedColors.accent.name;
            assignedType = 'accent';
            break;
        }
        
        return {
          ...result,
          assignedColor,
          assignedName,
          assignedType,
          isManualAssignment: true
        };
      }
      return result;
    });
    
    // Обновляем отображение
    displaySpotModeXManualResults(updatedResults, lastAnalysisResults.totalPixels, lastAnalysisResults.selectedColors);
  }
  
  // Обновляем стили кнопок в панели ручного назначения
  updateManualAssignmentButtons();
}

// Функция для обновления кнопок в панели ручного назначения
function updateManualAssignmentButtons() {
  const manualContent = document.getElementById('manualColorAssignmentContent');
  if (!manualContent) return;
  
  const buttons = manualContent.querySelectorAll('button');
  buttons.forEach(button => {
    const onclick = button.getAttribute('onclick');
    if (!onclick) return;
    
    const objectIdMatch = onclick.match(/assignColorToObject\((\d+)/);
    const colorTypeMatch = onclick.match(/'([^']+)'/);
    
    if (!objectIdMatch || !colorTypeMatch) return;
    
    const objectId = parseInt(objectIdMatch[1]);
    const colorType = colorTypeMatch[1];
    
    // Проверяем ручное назначение
    const manualAssignment = objectColorAssignments.get(objectId);
    // Проверяем автоматическое назначение из результатов анализа
    const autoAssignment = lastAnalysisResults ? 
      lastAnalysisResults.objectResults.find(r => r.objectId === objectId)?.assignedType : null;
    
    // Используем ручное назначение или автоматическое
    const currentAssignment = manualAssignment || autoAssignment || 'primary';
    const isAssigned = currentAssignment === colorType;
    
    // Обновляем стили кнопки
    if (colorType === 'primary') {
      const primaryColorHex = document.getElementById('primaryColorBtn').dataset.color;
      button.style.background = isAssigned ? primaryColorHex : '#f1f5f9';
      button.style.color = isAssigned ? 'white' : '#64748b';
    } else if (colorType === 'secondary') {
      const secondaryColorHex = document.getElementById('secondaryColorBtn').dataset.color;
      button.style.background = isAssigned ? secondaryColorHex : '#f1f5f9';
      button.style.color = isAssigned ? 'white' : '#64748b';
    } else if (colorType === 'accent') {
      const accentColorHex = document.getElementById('accentColorBtn').dataset.color;
      button.style.background = isAssigned ? accentColorHex : '#f1f5f9';
      button.style.color = isAssigned ? 'white' : '#64748b';
    }
  });
}

// Функция отображения результатов с ручным связыванием
function displaySpotModeXManualResults(objectResults, totalPixels, selectedColors) {
  // Группируем объекты по назначенным цветам
  const colorGroups = {
    primary: { objects: [], totalPixels: 0, color: selectedColors.primary.color, name: selectedColors.primary.name },
    secondary: { objects: [], totalPixels: 0, color: selectedColors.secondary.color, name: selectedColors.secondary.name },
    accent: { objects: [], totalPixels: 0, color: selectedColors.accent.color, name: selectedColors.accent.name }
  };
  
  objectResults.forEach(result => {
    // Проверяем ручное назначение для этого объекта
    const manualAssignment = objectColorAssignments.get(result.objectId);
    const assignedType = manualAssignment || result.assignedType;
    
    colorGroups[assignedType].objects.push(result);
    colorGroups[assignedType].totalPixels += result.totalPixels;
  });
  
  // Сортируем группы по количеству пикселей
  const sortedGroups = Object.entries(colorGroups)
    .filter(([type, group]) => group.totalPixels > 0)
    .sort((a, b) => b[1].totalPixels - a[1].totalPixels);
  
  let html = '';
  
  // Показываем общую цветовую полосу
  html += '<div class="color-bar" style="height:40px;margin-bottom:16px;">';
  
  sortedGroups.forEach(([type, group]) => {
    const groupPercent = Math.round((group.totalPixels / totalPixels) * 100);
    html += `<div class="color-segment" style="width:${groupPercent}%;background:${rgbToHex(group.color)};position:relative;">`;
    html += `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-weight:bold;font-size:0.85rem;text-shadow:1px 1px 2px rgba(0,0,0,0.7);">${group.name}</div>`;
    html += `</div>`;
  });
  html += '</div>';
  
      // Показываем детальную информацию с кнопками назначения
    html += '<ul class="color-list">';
    sortedGroups.forEach(([type, group]) => {
      const groupPercent = Math.round((group.totalPixels / totalPixels) * 100);
      const objectCount = group.objects.length;
          html += `<li style="margin-bottom:6px;">`;
    html += `<span class="color-dot" style="background:${rgbToHex(group.color)};width:20px;height:20px;"></span>`;
    html += `<b>${groupPercent}%</b>`;
    html += `<span style="color:#7a869a;font-size:0.98em;margin-left:8px;">${rgbToHex(group.color)}</span>`;
    html += `<span style="color:#6b7280;font-size:0.9em;margin-left:8px;">- ${group.totalPixels} pixels, ${objectCount} object${objectCount > 1 ? 's' : ''}</span>`;
    html += `</li>`;
  });
  html += '</ul>';
  
  // Показываем панель ручного назначения цветов наверху
  const manualPanel = document.getElementById('manualColorAssignmentPanel');
  const manualContent = document.getElementById('manualColorAssignmentContent');
  
  if (manualPanel && manualContent) {
    manualContent.innerHTML = '';
    
    // Получаем выбранные цвета для кнопок
    const primaryColorHex = document.getElementById('primaryColorBtn').dataset.color;
    const secondaryColorHex = document.getElementById('secondaryColorBtn').dataset.color;
    const accentColorHex = document.getElementById('accentColorBtn').dataset.color;



    objectResults.forEach(result => {
      const objectColor = getObjectColor(result.objectId - 1);
      const manualAssignment = objectColorAssignments.get(result.objectId);
      const currentColorType = manualAssignment || result.assignedType || 'primary';
      const manualIndicator = manualAssignment ? ' [Manual]' : '';
      const objectDiv = document.createElement('div');
      objectDiv.style.cssText = `
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 5px;
        padding: 6px 7px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        font-size: 0.92rem;
      `;
      objectDiv.innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;">
          <div style="width:10px;height:10px;background:${objectColor};border-radius:50%;"></div>
          <span style="font-size:0.98rem;color:#374151;white-space:nowrap;">Object ${result.objectId}</span>
          ${manualAssignment ? '<span style=\"color:#565656;font-size:0.8rem;\">[Manual]</span>' : ''}
        </div>
        <div style="display:flex;gap:2px;">
          <button onclick="assignColorToObject(${result.objectId}, 'primary')" style="padding:3px 7px;font-size:0.78rem;border:none;border-radius:3px;cursor:pointer;background:${currentColorType === 'primary' ? primaryColorHex : '#f1f5f9'};color:${currentColorType === 'primary' ? 'white' : '#64748b'};min-width:38px;outline:none;">Primary</button>
          <button onclick="assignColorToObject(${result.objectId}, 'secondary')" style="padding:3px 7px;font-size:0.78rem;border:none;border-radius:3px;cursor:pointer;background:${currentColorType === 'secondary' ? secondaryColorHex : '#f1f5f9'};color:${currentColorType === 'secondary' ? 'white' : '#64748b'};min-width:38px;outline:none;">Secondary</button>
          <button onclick="assignColorToObject(${result.objectId}, 'accent')" style="padding:3px 7px;font-size:0.78rem;border:none;border-radius:3px;cursor:pointer;background:${currentColorType === 'accent' ? accentColorHex : '#f1f5f9'};color:${currentColorType === 'accent' ? 'white' : '#64748b'};min-width:38px;outline:none;">Accent</button>
        </div>
      `;
          manualContent.appendChild(objectDiv);
  });
  
  // Обновляем стили кнопок после создания панели
  updateManualAssignmentButtons();
  }
  
  // Показываем общую статистику
  html += `<div class="ideal" style="margin-top:16px;">`;
  html += `<div>Objects analyzed: <b>${objectResults.length}</b></div>`;
  html += `<div>Manual assignments: <b>${Array.from(objectColorAssignments.keys()).length}</b></div>`;
  
  result.innerHTML = html;
}

// Оптимизированная функция для точного анализа объектов в Spot Mode X
function analyzeSpotModeXObjects() {
  console.log('Analyzing objects for Spot Mode X:', selectedObjects.length);
  
  if (selectedObjects.length === 0) {
    result.innerHTML = '<div style="color:#e53e3e">No objects selected. Please draw around objects first.</div>';
    return;
  }
  
  // Проверяем валидность размеров
  if (!preview.naturalWidth || !preview.naturalHeight || !preview.offsetWidth || !preview.offsetHeight) {
    console.error('Invalid preview dimensions');
    result.innerHTML = '<div style="color:#e53e3e">Invalid image dimensions</div>';
    return;
  }
  
  // Создаем временный canvas для анализа с оптимизацией для частого чтения
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  tempCanvas.width = preview.naturalWidth;
  tempCanvas.height = preview.naturalHeight;
  
  // Рисуем изображение на временном canvas
  tempCtx.drawImage(preview, 0, 0);
  
  // Конвертируем координаты из отображаемого размера в натуральный
  const scaleX = preview.naturalWidth / preview.offsetWidth;
  const scaleY = preview.naturalHeight / preview.offsetHeight;
  
  console.log('Scale factors:', { scaleX, scaleY });
  console.log('Image dimensions:', { 
    naturalWidth: preview.naturalWidth, 
    naturalHeight: preview.naturalHeight,
    offsetWidth: preview.offsetWidth, 
    offsetHeight: preview.offsetHeight 
  });
  
  // Анализируем каждый объект отдельно
  const objectResults = [];
  let totalPixels = 0;
  
  selectedObjects.forEach((object, objectIndex) => {
    if (!object.path || object.path.length < 3) {
      console.error(`Object ${objectIndex + 1} has invalid path`);
      return;
    }
    
    // Создаем путь для проверки попадания пикселей
    const naturalPath = object.path.map(point => ({
      x: Math.round(point.x * scaleX),
      y: Math.round(point.y * scaleY)
    }));
    
    // Получаем границы объекта
    const bounds = getPathBounds(naturalPath);
    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;

    // Получаем сразу все пиксели в bounding box одним вызовом
    const imageData = tempCtx.getImageData(bounds.minX, bounds.minY, width, height).data;

    let objectPixels = 0;
    const pixelColors = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Координаты в canvas
        const canvasX = bounds.minX + x;
        const canvasY = bounds.minY + y;
        // Проверяем попадание в полигон
        if (isPointInPolygon(canvasX, canvasY, naturalPath)) {
          const idx = (y * width + x) * 4;
          const r = imageData[idx];
          const g = imageData[idx + 1];
          const b = imageData[idx + 2];
          const a = imageData[idx + 3];
          if (a >= 128) {
            pixelColors.push([r, g, b]);
            objectPixels++;
          }
        }
      }
    }
    
    console.log(`Object ${objectIndex + 1}: ${objectPixels} total pixels, ${pixelColors.length} valid colors`);
    
    if (pixelColors.length > 0) {
      // Оптимизированный анализ цветов
      const colorCounts = new Map();
      
      // Быстрый подсчет цветов
      for (const color of pixelColors) {
        const colorKey = `${color[0]},${color[1]},${color[2]}`;
        colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
      }
      
      // Находим доминирующий цвет
      let dominantColor = null;
      let maxCount = 0;
      
      for (const [colorKey, count] of colorCounts) {
        if (count > maxCount) {
          maxCount = count;
          dominantColor = colorKey.split(',').map(Number);
        }
      }
      
      const dominantPercent = Math.round((maxCount / pixelColors.length) * 100);
      
      // Создаем результат объекта
      const objectResult = {
        objectId: objectIndex + 1,
        dominantColor,
        dominantName: `Color ${dominantColor[0]},${dominantColor[1]},${dominantColor[2]}`,
        dominantPercent,
        dominantPixels: maxCount,
        totalPixels: pixelColors.length,
        allColors: [dominantColor],
        allNames: [`Color ${dominantColor[0]},${dominantColor[1]},${dominantColor[2]}`],
        allPercents: [dominantPercent],
        allCounts: [maxCount],
        assignedColor: dominantColor,
        assignedName: `Color ${dominantColor[0]},${dominantColor[1]},${dominantColor[2]}`,
        assignedType: 'primary' // По умолчанию назначаем как primary
      };
      
      objectResults.push(objectResult);
      totalPixels += pixelColors.length;
    }
  });
  
  console.log('Analysis complete:', {
    objects: objectResults.length,
    totalPixels,
    results: objectResults
  });
  
  // Получаем выбранные цвета пользователем
  const primaryColor = document.getElementById('primaryColorBtn').dataset.color;
  const secondaryColor = document.getElementById('secondaryColorBtn').dataset.color;
  const accentColor = document.getElementById('accentColorBtn').dataset.color;
  
  const primaryName = document.getElementById('primaryColorName').value || 'Primary';
  const secondaryName = document.getElementById('secondaryColorName').value || 'Secondary';
  const accentName = document.getElementById('accentColorName').value || 'Accent';
  
  // Конвертируем hex в RGB
  const primaryRGB = hexToRgb(primaryColor);
  const secondaryRGB = hexToRgb(secondaryColor);
  const accentRGB = hexToRgb(accentColor);
  
  // Отображаем результаты с выбранными цветами
  displaySpotModeXManualResults(objectResults, totalPixels, {
    primary: { color: primaryRGB || [59, 130, 246], name: primaryName },
    secondary: { color: secondaryRGB || [245, 158, 11], name: secondaryName },
    accent: { color: accentRGB || [16, 185, 129], name: accentName }
  });
}

// Функция для конвертации hex в RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
}

// Функция для вычисления среднего цвета
function calculateAverageColor(pixels) {
  if (pixels.length === 0) return [0, 0, 0];
  
  const sum = pixels.reduce((acc, pixel) => {
    acc[0] += pixel[0];
    acc[1] += pixel[1];
    acc[2] += pixel[2];
    return acc;
  }, [0, 0, 0]);
  
  return [
    Math.round(sum[0] / pixels.length),
    Math.round(sum[1] / pixels.length),
    Math.round(sum[2] / pixels.length)
  ];
}

// Функция для инициализации color picker
function initColorPicker() {
  // Обработчики для кнопок выбора цвета
  document.getElementById('primaryColorBtn').addEventListener('click', () => openColorPicker('primary'));
  document.getElementById('secondaryColorBtn').addEventListener('click', () => openColorPicker('secondary'));
  document.getElementById('accentColorBtn').addEventListener('click', () => openColorPicker('accent'));
}

// Функция для открытия нативного color picker
function openColorPicker(target) {
  const targetBtn = document.getElementById(target + 'ColorBtn');
  
  // Создаем скрытый input и сразу открываем picker
  const tempInput = document.createElement('input');
  tempInput.type = 'color';
  tempInput.value = targetBtn.dataset.color;
  tempInput.style.position = 'absolute';
  tempInput.style.left = '500px';
  tempInput.style.top = '500px';
  tempInput.style.opacity = '0';
  tempInput.style.pointerEvents = 'none';
  
  document.body.appendChild(tempInput);
  
  // Обработчик изменения цвета
  tempInput.addEventListener('change', (e) => {
    const newColor = e.target.value;
    targetBtn.style.background = newColor;
    targetBtn.dataset.color = newColor;
    document.body.removeChild(tempInput);
  });
  
  // Обработчик закрытия picker
  tempInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.body.contains(tempInput)) {
        document.body.removeChild(tempInput);
      }
    }, 100);
  });
  
  // Сразу открываем нативный picker
  tempInput.click();
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
  // Инициализируем color picker
  initColorPicker();
  
  // Инициализируем темную тему
  const toggleSwitch = document.getElementById('darkModeToggle');
  const body = document.body;
  
  // Check for saved theme preference or default to light mode
  const currentTheme = localStorage.getItem('theme') || 'light';
  if (currentTheme === 'dark') {
    body.classList.add('dark');
    toggleSwitch.classList.add('active');
  }
  
  // Toggle theme
  toggleSwitch.addEventListener('click', function() {
    body.classList.toggle('dark');
    toggleSwitch.classList.toggle('active');
    
    // Save theme preference
    const theme = body.classList.contains('dark') ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
  });
});