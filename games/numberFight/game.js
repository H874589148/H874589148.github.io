// ====== 数字围攻 · 策略小游戏 ======

const BOARD_SIZE = 6;
const DIRECTIONS = [
  [-1, 0], [1, 0], [0, -1], [0, 1]
];

// 游戏状态
let board = []; // 每个格子: { value, owner: null | 'player' | 'enemy' }
let currentTurn = 'player';
let gameOver = false;
let bestWins = 0;

// DOM
const boardEl = document.getElementById('board');
const playerScoreEl = document.getElementById('playerScore');
const enemyScoreEl = document.getElementById('enemyScore');
const playerCountEl = document.getElementById('playerCount');
const enemyCountEl = document.getElementById('enemyCount');
const turnIndicator = document.getElementById('turnIndicator');
const turnText = document.getElementById('turnText');
const turnSub = document.getElementById('turnSub');
const bestWinsEl = document.getElementById('bestWins');
const restartBtn = document.getElementById('restartBtn');
const rulesBtn = document.getElementById('rulesBtn');
const rulesModal = document.getElementById('rulesModal');
const closeRulesBtn = document.getElementById('closeRulesBtn');
const endModal = document.getElementById('endModal');
const endTitle = document.getElementById('endTitle');
const endSubtitle = document.getElementById('endSubtitle');
const endPlayerScore = document.getElementById('endPlayerScore');
const endEnemyScore = document.getElementById('endEnemyScore');
const endDiff = document.getElementById('endDiff');
const playAgainBtn = document.getElementById('playAgainBtn');

// ====== 初始化 ======
function init() {
  loadBestWins();
  createBoard();
  resetGame();
  bindEvents();
}

// 生成棋盘：中心格子数值更高
function generateCellValue(row, col) {
  // 距离中心的距离，越近数值越高
  const centerRow = (BOARD_SIZE - 1) / 2;
  const centerCol = (BOARD_SIZE - 1) / 2;
  const dist = Math.sqrt(Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2));
  
  // 基础值 1-9，中心加成
  let base = 1 + Math.floor(Math.random() * 6); // 1-6
  if (dist < 1.5) base += 3;       // 中心 4 格: 4-9
  else if (dist < 2.8) base += 1;  // 中间环: 2-7
  return Math.min(base, 9);
}

function isCenterCell(row, col) {
  const centerRow = (BOARD_SIZE - 1) / 2;
  const centerCol = (BOARD_SIZE - 1) / 2;
  return Math.sqrt(Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2)) < 1.5;
}

function createBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      if (isCenterCell(r, c)) {
        cell.classList.add('center-cell');
      }
      cell.addEventListener('click', () => handleCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function resetGame() {
  board = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      row.push({
        value: generateCellValue(r, c),
        owner: null
      });
    }
    board.push(row);
  }
  
  // 初始状态：对角各放一个棋子
  board[0][0].owner = 'player';
  board[BOARD_SIZE-1][BOARD_SIZE-1].owner = 'enemy';
  
  currentTurn = 'player';
  gameOver = false;
  
  renderBoard();
  updateScores();
  updateTurnIndicator();
  endModal.classList.add('hidden');
}

// ====== 渲染 ======
function renderBoard() {
  const cells = boardEl.children;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const idx = r * BOARD_SIZE + c;
      const cellEl = cells[idx];
      const cellData = board[r][c];
      
      cellEl.textContent = cellData.owner ? cellData.value : cellData.value;
      cellEl.classList.remove('player', 'enemy', 'occupied', 'disabled', 'hint');
      
      if (cellData.owner === 'player') {
        cellEl.classList.add('player', 'occupied');
      } else if (cellData.owner === 'enemy') {
        cellEl.classList.add('enemy', 'occupied');
      }
      
      if (gameOver || currentTurn !== 'player') {
        cellEl.classList.add('disabled');
      }
    }
  }
  
  // 玩家回合时，给能引发翻转的格子加提示（可选，保持简洁不做）
}

function updateScores() {
  let playerSum = 0, enemySum = 0;
  let playerCnt = 0, enemyCnt = 0;
  
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell.owner === 'player') {
        playerSum += cell.value;
        playerCnt++;
      } else if (cell.owner === 'enemy') {
        enemySum += cell.value;
        enemyCnt++;
      }
    }
  }
  
  playerScoreEl.textContent = playerSum;
  enemyScoreEl.textContent = enemySum;
  playerCountEl.textContent = playerCnt + ' 格';
  enemyCountEl.textContent = enemyCnt + ' 格';
  
  return { playerSum, enemySum, playerCnt, enemyCnt };
}

function updateTurnIndicator() {
  turnIndicator.classList.remove('player-turn', 'enemy-turn');
  if (gameOver) {
    turnText.textContent = '游戏结束';
    turnSub.textContent = '点击重新开始';
  } else if (currentTurn === 'player') {
    turnIndicator.classList.add('player-turn');
    turnText.textContent = '你的回合';
    turnSub.textContent = '选择一个空格占领';
  } else {
    turnIndicator.classList.add('enemy-turn');
    turnText.textContent = '红方思考中';
    turnSub.textContent = '等待对手行动';
  }
}

// ====== 核心玩法 ======
function handleCellClick(row, col) {
  if (gameOver || currentTurn !== 'player') return;
  if (board[row][col].owner !== null) return;
  
  placePiece(row, col, 'player');
  
  if (!gameOver) {
    currentTurn = 'enemy';
    updateTurnIndicator();
    renderBoard();
    
    // AI 延时行动
    setTimeout(aiMove, 600);
  }
}

function placePiece(row, col, owner) {
  board[row][col].owner = owner;
  
  // 放置动画
  const idx = row * BOARD_SIZE + col;
  const cellEl = boardEl.children[idx];
  cellEl.classList.add('placed');
  setTimeout(() => cellEl.classList.remove('placed'), 600);
  
  // 连锁翻转
  const flipped = cascadeFlip(row, col, owner);
  
  // 更新分数
  const scores = updateScores();
  renderBoard();
  
  // 检查游戏是否结束
  checkGameOver(scores);
}

// 连锁翻转：BFS 方式检查所有被翻转的格子
function cascadeFlip(startRow, startCol, attacker) {
  const defender = attacker === 'player' ? 'enemy' : 'player';
  const toFlip = [];
  const visited = new Set();
  const queue = [[startRow, startCol, true]]; // row, col, isNew
  
  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    
    const cellValue = board[r][c].value;
    
    for (const [dr, dc] of DIRECTIONS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
      
      const neighbor = board[nr][nc];
      const nKey = `${nr},${nc}`;
      
      // 邻居是敌方且数值小于当前格子 → 翻转
      if (neighbor.owner === defender && neighbor.value < cellValue && !visited.has(nKey)) {
        toFlip.push([nr, nc]);
        board[nr][nc].owner = attacker;
        queue.push([nr, nc, false]);
      }
    }
  }
  
  // 翻转动画（延迟依次播放）
  toFlip.forEach(([r, c], i) => {
    setTimeout(() => {
      const idx = r * BOARD_SIZE + c;
      const cellEl = boardEl.children[idx];
      cellEl.classList.add('flipping');
      setTimeout(() => cellEl.classList.remove('flipping'), 450);
      // 重新渲染该格
      cellEl.classList.remove('player', 'enemy');
      cellEl.classList.add(attacker === 'player' ? 'player' : 'enemy');
      cellEl.textContent = board[r][c].value;
    }, i * 60 + 150);
  });
  
  return toFlip.length;
}

// ====== AI 策略 ======
function aiMove() {
  if (gameOver) return;
  
  let bestScore = -Infinity;
  let bestMoves = [];
  
  // 遍历所有空格，计算每步的价值
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].owner !== null) continue;
      
      const score = evaluateMove(r, c, 'enemy');
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [[r, c]];
      } else if (score === bestScore) {
        bestMoves.push([r, c]);
      }
    }
  }
  
  if (bestMoves.length === 0) {
    // 没有可走的格子（棋盘满了）
    checkGameOver(updateScores());
    return;
  }
  
  // 随机选一个最优解，增加变化
  const [row, col] = bestMoves[Math.floor(Math.random() * bestMoves.length)];
  placePiece(row, col, 'enemy');
  
  if (!gameOver) {
    currentTurn = 'player';
    updateTurnIndicator();
    renderBoard();
  }
}

// 评估一步棋的价值
function evaluateMove(row, col, attacker) {
  const defender = attacker === 'player' ? 'enemy' : 'player';
  
  // 模拟放置
  const cellValue = board[row][col].value;
  let flipCount = 0;
  let flipValue = 0;
  
  // BFS 模拟翻转
  const queue = [[row, col]];
  const simulated = new Set();
  simulated.add(`${row},${col}`);
  
  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const curValue = board[r][c].value;
    
    for (const [dr, dc] of DIRECTIONS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
      const nKey = `${nr},${nc}`;
      if (simulated.has(nKey)) continue;
      
      const neighbor = board[nr][nc];
      if (neighbor.owner === defender && neighbor.value < curValue) {
        flipCount++;
        flipValue += neighbor.value;
        simulated.add(nKey);
        queue.push([nr, nc]);
      }
    }
  }
  
  // 评分 = 翻转的总数值 * 2 + 自身数值 + 位置权重
  const centerRow = (BOARD_SIZE - 1) / 2;
  const centerCol = (BOARD_SIZE - 1) / 2;
  const dist = Math.sqrt(Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2));
  const positionBonus = (BOARD_SIZE - dist) * 0.5;
  
  // 如果能翻转，价值更高；不能翻转的话，占高值格子
  let score = flipValue * 2.5 + cellValue * 0.8 + positionBonus;
  
  // 防守评估：如果玩家下一步在这格能翻转很多，我们要抢
  let playerFlipValue = 0;
  const pQueue = [[row, col]];
  const pSim = new Set();
  pSim.add(`${row},${col}`);
  while (pQueue.length > 0) {
    const [r, c] = pQueue.shift();
    const cv = board[r][c].value;
    for (const [dr, dc] of DIRECTIONS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
      const nk = `${nr},${nc}`;
      if (pSim.has(nk)) continue;
      const nb = board[nr][nc];
      if (nb.owner === 'enemy' && nb.value < cv) {
        playerFlipValue += nb.value;
        pSim.add(nk);
        pQueue.push([nr, nc]);
      }
    }
  }
  score += playerFlipValue * 0.8; // 防守权重
  
  return score;
}

// ====== 游戏结束 ======
function checkGameOver(scores) {
  // 检查棋盘是否填满
  let emptyCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].owner === null) emptyCount++;
    }
  }
  
  if (emptyCount === 0) {
    gameOver = true;
    showEndScreen(scores);
  }
}

function showEndScreen(scores) {
  const { playerSum, enemySum } = scores;
  const diff = playerSum - enemySum;
  
  if (diff > 0) {
    endTitle.textContent = '胜利！';
    endTitle.className = 'victory';
    endDiff.textContent = `领先 ${diff} 分`;
    if (diff >= 20) endSubtitle.textContent = '碾压式胜利，太强了！';
    else if (diff >= 10) endSubtitle.textContent = '优势明显，策略出色';
    else endSubtitle.textContent = '你以微弱优势险胜';
    
    // 更新胜场
    bestWins++;
    saveBestWins();
    bestWinsEl.textContent = bestWins;
  } else if (diff < 0) {
    endTitle.textContent = '失败';
    endTitle.className = 'defeat';
    endDiff.textContent = `落后 ${Math.abs(diff)} 分`;
    if (Math.abs(diff) >= 20) endSubtitle.textContent = '差距有点大，再来一局试试？';
    else if (Math.abs(diff) >= 10) endSubtitle.textContent = '红方更胜一筹';
    else endSubtitle.textContent = '差一点点，非常可惜';
  } else {
    endTitle.textContent = '平局';
    endTitle.className = 'draw';
    endSubtitle.textContent = '势均力敌，旗鼓相当';
    endDiff.textContent = '双方分数相同';
  }
  
  endPlayerScore.textContent = playerSum;
  endEnemyScore.textContent = enemySum;
  
  updateTurnIndicator();
  
  // 稍微延迟显示
  setTimeout(() => {
    endModal.classList.remove('hidden');
  }, 600);
}

// ====== 持久化 ======
function loadBestWins() {
  try {
    const saved = localStorage.getItem('numbersiege_bestwins');
    if (saved) {
      bestWins = parseInt(saved, 10) || 0;
      bestWinsEl.textContent = bestWins;
    }
  } catch (e) {
    // 隐私模式等情况静默失败
    bestWins = 0;
  }
}

function saveBestWins() {
  try {
    localStorage.setItem('numbersiege_bestwins', bestWins.toString());
  } catch (e) {
    // 静默失败
  }
}

// ====== 事件绑定 ======
function bindEvents() {
  restartBtn.addEventListener('click', () => {
    resetGame();
  });
  
  rulesBtn.addEventListener('click', () => {
    rulesModal.classList.remove('hidden');
  });
  
  closeRulesBtn.addEventListener('click', () => {
    rulesModal.classList.add('hidden');
  });
  
  rulesModal.addEventListener('click', (e) => {
    if (e.target === rulesModal) {
      rulesModal.classList.add('hidden');
    }
  });
  
  playAgainBtn.addEventListener('click', () => {
    resetGame();
  });
  
  // 暂停处理：切到后台自动暂停（回合制游戏主要是防止动画错乱）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // 回合制，不需要暂停主循环
    }
  });
}

// 缩略图模式：停在菜单态
const params = new URLSearchParams(window.location.search);
if (params.get('thumbnail') === '1') {
  // 缩略图模式，不自动开局，直接渲染初始状态
  init();
} else {
  init();
}
