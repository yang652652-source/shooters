(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const hud = {
    health: document.getElementById("health"),
    weapon: document.getElementById("weapon"),
    score: document.getElementById("score"),
    bossWrap: document.getElementById("boss-wrap"),
    bossFill: document.getElementById("boss-fill"),
    debug: document.getElementById("debug"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlay-title"),
    overlayBody: document.getElementById("overlay-body"),
    overlaySub: document.getElementById("overlay-sub"),
    playerIdLabel: document.getElementById("player-id-label"),
    playerId: document.getElementById("player-id"),
    playerSummary: document.getElementById("player-summary"),
    summaryPlayerId: document.getElementById("summary-player-id"),
    summaryStageTime: document.getElementById("summary-stage-time"),
    summaryDefeated: document.getElementById("summary-defeated"),
    upgradeOptions: document.getElementById("upgrade-options"),
    leaderboard: document.getElementById("leaderboard")
  };

  const CONFIG = {
    width: 960,
    height: 540,
    worldLength: 4300,
    groundY: 478,
    killY: 680,
    debug: { enabled: false },
    player: {
      x: 80, y: 380, width: 30, standHeight: 46, crouchHeight: 28, maxHp: 5,
      acceleration: 1750, maxSpeed: 225, crouchSpeed: 95, friction: 1500,
      gravity: 1500, jumpVelocity: -540, maxFallSpeed: 760,
      coyoteTime: 0.1, jumpBuffer: 0.1, airJumps: 1, shootInterval: 0.18, rapidInterval: 0.09,
      spreadDuration: 8, rapidDuration: 8, bulletSpeed: 690,
      dashSpeed: 540, dashDuration: 0.25, dashCooldown: 1.5, damageInvuln: 1
    },
    enemies: {
      activateDistance: 940, patrolHp: 2, turretHp: 3, flyerHp: 2,
      patrolSpeed: 62, patrolShootRange: 430, turretShootRange: 680,
      flyerShootRange: 600, enemyBulletSpeed: 155, bossHp: 30,
      bossDamage: 2, bossArena: { x: 3300, right: 4300 }
    },
    camera: { lead: 0.38, lerp: 8 },
    leaderboard: {
      apiUrl: "https://shooters-leaderboard.yang652652.workers.dev",
      key: "pixel-runner-gunner-scores",
      playerKey: "pixel-runner-gunner-player-id",
      maxEntries: 5
    },
    scoring: {
      runTimePar: 420, timeBonusPerSecond: 8, comboWindow: 2.6,
      stagePar: 120, stageClearBase: 900, stageClearStep: 120,
      healthBonusPerHp: 120, speedBonusPerSecond: 10, damagePenaltyPerHp: 45
    }
  };

  const KEY = {
    left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"],
    up: ["ArrowUp", "KeyW", "Space"], down: ["ArrowDown", "KeyS"],
    shoot: ["KeyJ"], dash: ["KeyK"], pause: ["KeyP"], restart: ["KeyR"],
    start: ["Enter", "KeyJ", "Space"], debug: ["F3", "Backquote"]
  };

  class Input {
    constructor() {
      this.down = new Set();
      this.pressed = new Set();
      this.released = new Set();
      window.addEventListener("keydown", (event) => {
        if (event.target === hud.playerId) return;
        if (this.shouldCapture(event.code)) event.preventDefault();
        if (!this.down.has(event.code)) this.pressed.add(event.code);
        this.down.add(event.code);
        ensureAudio();
      });
      window.addEventListener("keyup", (event) => {
        if (event.target === hud.playerId) return;
        if (this.shouldCapture(event.code)) event.preventDefault();
        this.down.delete(event.code);
        this.released.add(event.code);
      });
      window.addEventListener("blur", () => {
        this.down.clear();
        this.pressed.clear();
        this.released.clear();
      });
    }
    shouldCapture(code) { return Object.values(KEY).some((group) => group.includes(code)); }
    isDown(action) { return KEY[action].some((code) => this.down.has(code)); }
    wasPressed(action) { return KEY[action].some((code) => this.pressed.has(code)); }
    wasReleased(action) { return KEY[action].some((code) => this.released.has(code)); }
    endFrame() { this.pressed.clear(); this.released.clear(); }
  }

  let audioContext = null;
  function ensureAudio() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
  }
  function tone(type) {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const s = {
      shoot: [740, 0.035, "square", 0.035], hurt: [110, 0.18, "sawtooth", 0.08],
      boom: [80, 0.32, "triangle", 0.12], pickup: [980, 0.18, "sine", 0.06],
      warning: [180, 0.42, "square", 0.08], jump: [420, 0.08, "triangle", 0.035],
      dash: [260, 0.09, "sawtooth", 0.045]
    }[type] || [440, 0.1, "square", 0.04];
    osc.type = s[2];
    osc.frequency.setValueAtTime(s[0], now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, s[0] * 0.45), now + s[1]);
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    gain.gain.setValueAtTime(s[3], now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + s[1]);
    osc.connect(filter); filter.connect(gain); gain.connect(audioContext.destination);
    osc.start(now); osc.stop(now + s[1] + 0.03);
  }

  const input = new Input();
  const STAGES = [
    {
      name: "OUTPOST",
      label: "前哨基地",
      length: CONFIG.worldLength,
      theme: "base",
      bossName: "守门机甲 阿尔法",
      boss: { hp: 24, damage: 1, pattern: "burst", speed: 70 },
      platforms: [
      { x: 0, y: CONFIG.groundY, w: 760, h: 72, area: "base" },
      { x: 860, y: CONFIG.groundY, w: 470, h: 72, area: "base" },
      { x: 1390, y: CONFIG.groundY, w: 680, h: 72, area: "jungle" },
      { x: 2190, y: CONFIG.groundY, w: 650, h: 72, area: "mech" },
      { x: 2960, y: CONFIG.groundY, w: 1340, h: 72, area: "boss" },
      { x: 405, y: 405, w: 190, h: 24, area: "base" },
      { x: 965, y: 390, w: 190, h: 24, area: "base" },
      { x: 1470, y: 382, w: 230, h: 24, area: "jungle" },
      { x: 1745, y: 328, w: 165, h: 24, area: "jungle" },
      { x: 2265, y: 392, w: 205, h: 24, area: "mech" },
      { x: 2525, y: 342, w: 195, h: 24, area: "mech" },
      { x: 2765, y: 405, w: 160, h: 24, area: "mech" },
      { x: 3120, y: 372, w: 170, h: 24, area: "boss" }
    ],
      hazards: [{ x: 2050, y: 454, w: 70, h: 24 }, { x: 2868, y: 454, w: 64, h: 24 }],
      checkpoints: [{ x: 80, y: 360 }, { x: 900, y: 360 }, { x: 1500, y: 340 }, { x: 2350, y: 350 }, { x: 3140, y: 330 }],
      enemySpawns: [
      { type: "patrol", x: 690, y: 436, minX: 620, maxX: 748 },
      { type: "patrol", x: 1040, y: 436, minX: 900, maxX: 1270 },
      { type: "patrol", x: 1580, y: 340, minX: 1485, maxX: 1650 },
      { type: "turret", x: 1828, y: 290 },
      { type: "turret", x: 2328, y: 354 },
      { type: "flyer", x: 2480, y: 230, range: 130 },
      { type: "flyer", x: 2840, y: 255, range: 150 },
      { type: "patrol", x: 3060, y: 436, minX: 2985, maxX: 3260 }
    ],
      itemSpawns: [
      { type: "health", x: 1210, y: 430 }, { type: "health", x: 1660, y: 328 },
      { type: "rapid", x: 2380, y: 344 }, { type: "spread", x: 2700, y: 294 },
      { type: "health", x: 3185, y: 320 }
      ]
    },
    {
      name: "SKYLINE",
      label: "空港天线",
      length: CONFIG.worldLength,
      theme: "jungle",
      bossName: "天空守卫 芙蕾雅",
      boss: { hp: 34, damage: 2, pattern: "fan", speed: 92 },
      platforms: null,
      hazards: [{ x: 760, y: 454, w: 64, h: 24 }, { x: 1880, y: 454, w: 80, h: 24 }, { x: 2780, y: 454, w: 70, h: 24 }],
      checkpoints: [{ x: 80, y: 360 }, { x: 980, y: 340 }, { x: 1720, y: 310 }, { x: 2480, y: 350 }, { x: 3140, y: 330 }],
      enemySpawns: [
        { type: "flyer", x: 720, y: 230, range: 170 },
        { type: "patrol", x: 1040, y: 436, minX: 900, maxX: 1280 },
        { type: "flyer", x: 1480, y: 210, range: 180 },
        { type: "turret", x: 1840, y: 290 },
        { type: "flyer", x: 2360, y: 250, range: 190 },
        { type: "turret", x: 2680, y: 367 },
        { type: "patrol", x: 3060, y: 436, minX: 2985, maxX: 3260 }
      ],
      itemSpawns: [
        { type: "health", x: 1160, y: 430 }, { type: "spread", x: 1680, y: 286 },
        { type: "rapid", x: 2450, y: 344 }, { type: "health", x: 3185, y: 320 }
      ]
    },
    {
      name: "CORE",
      label: "核心工厂",
      length: CONFIG.worldLength,
      theme: "mech",
      bossName: "核心巨像 提丰",
      boss: { hp: 46, damage: 2, pattern: "summon", speed: 118 },
      platforms: null,
      hazards: [{ x: 690, y: 454, w: 80, h: 24 }, { x: 1320, y: 454, w: 90, h: 24 }, { x: 2050, y: 454, w: 90, h: 24 }, { x: 2868, y: 454, w: 86, h: 24 }],
      checkpoints: [{ x: 80, y: 360 }, { x: 940, y: 360 }, { x: 1600, y: 340 }, { x: 2360, y: 350 }, { x: 3140, y: 330 }],
      enemySpawns: [
        { type: "patrol", x: 620, y: 436, minX: 540, maxX: 748 },
        { type: "turret", x: 1050, y: 352 },
        { type: "flyer", x: 1510, y: 220, range: 180 },
        { type: "patrol", x: 1740, y: 436, minX: 1460, maxX: 1960 },
        { type: "turret", x: 2328, y: 354 },
        { type: "flyer", x: 2700, y: 225, range: 180 },
        { type: "patrol", x: 3060, y: 436, minX: 2985, maxX: 3260 }
      ],
      itemSpawns: [
        { type: "health", x: 900, y: 430 }, { type: "rapid", x: 1560, y: 328 },
        { type: "spread", x: 2380, y: 344 }, { type: "health", x: 3185, y: 320 }
      ]
    }
  ];
  STAGES[1].platforms = STAGES[0].platforms.map((platform) => ({ ...platform, area: platform.area === "boss" ? "boss" : "jungle" }));
  STAGES[2].platforms = STAGES[0].platforms.map((platform) => ({ ...platform, area: platform.area === "boss" ? "boss" : "mech" }));
  let level = STAGES[0];

  const UPGRADES = [
    { id: "maxHp", name: "装甲核心", desc: "最大生命 +1，并立即回复 1 点生命。" },
    { id: "speed", name: "推进腿甲", desc: "移动速度提升 10%。" },
    { id: "fireRate", name: "过热枪管", desc: "射击间隔缩短 15%。" },
    { id: "bullet", name: "穿甲弹药", desc: "子弹伤害 +1。" },
    { id: "airJump", name: "空中套件", desc: "额外空中跳跃次数 +1。" },
    { id: "dash", name: "冷却冲刺", desc: "冲刺冷却时间缩短。" }
  ];
  const BOSS_AFFIXES = [
    {
      id: "swift", name: "迅捷",
      apply: (boss) => {
        boss.affixSpeedMult = 1.2;
        boss.affixShotCooldownMult = 0.9;
      }
    },
    {
      id: "shield", name: "护盾",
      apply: (boss) => {
        boss.shieldHp = Math.round(boss.maxHp * 0.35);
        boss.shieldMax = boss.shieldHp;
      }
    },
    {
      id: "barrage", name: "弹幕",
      apply: (boss) => {
        boss.affixExtraShots = 2;
        boss.affixBulletSpeedBonus = 35;
      }
    },
    {
      id: "berserk", name: "狂暴",
      apply: (boss) => {
        boss.enrageThreshold = 0.45;
        boss.enrageSpeedMult = 1.35;
        boss.enrageShotMult = 0.78;
      }
    }
  ];

  const game = {
    state: "menu", time: 0, levelTime: 0, score: 0, defeated: 0,
    stageIndex: 0, runTime: 0, stageTime: 0, timeBonus: 0, combo: 0, comboTimer: 0,
    stageBonus: 0, healthBonus: 0, speedBonus: 0, damagePenalty: 0,
    growth: null, upgradeChoices: [],
    camera: { x: 0, y: 0, shake: 0 }, player: null, enemies: [],
    playerBullets: [], enemyBullets: [], particles: [], texts: [], items: [],
    boss: null, bossActive: false, bossDefeated: false, warningTimer: 0,
    bossIntroTimer: 0, bossIntroName: "", bossDefeatedCount: 0, damageTaken: 0,
    safePoint: { x: 80, y: 360 }, fps: 0, fpsTimer: 0, fpsFrames: 0,
    scoreSaved: false, playerId: "玩家1", leaderboardMode: "local"
  };
  const leaderboardScroll = {
    rafId: 0, lastTime: 0, paused: false, initialized: false
  };

  function makePlayer() {
    const growth = game.growth || makeGrowth();
    return {
      x: CONFIG.player.x, y: CONFIG.player.y, w: CONFIG.player.width, h: CONFIG.player.standHeight,
      standH: CONFIG.player.standHeight, crouchH: CONFIG.player.crouchHeight,
      vx: 0, vy: 0, hp: growth.maxHp, maxHp: growth.maxHp, facing: 1,
      grounded: false, crouching: false, coyote: 0, jumpBuffer: 0, shootCooldown: 0,
      airJumpsRemaining: growth.airJumps,
      dashTimer: 0, dashCooldown: 0, damageInvuln: 0, weaponType: "normal",
      weaponTimer: 0, hitFlash: 0, muzzleFlash: 0, walkClock: 0
    };
  }

  function makeEnemy(spawn) {
    const common = { type: spawn.type, x: spawn.x, y: spawn.y, vx: 0, vy: 0, facing: -1, shootCooldown: 0.8 + Math.random() * 0.5, hitFlash: 0, dead: false, active: false };
    if (spawn.type === "patrol") return { ...common, w: 30, h: 42, hp: CONFIG.enemies.patrolHp, maxHp: CONFIG.enemies.patrolHp, minX: spawn.minX, maxX: spawn.maxX, vx: CONFIG.enemies.patrolSpeed };
    if (spawn.type === "turret") return { ...common, w: 38, h: 38, hp: CONFIG.enemies.turretHp, maxHp: CONFIG.enemies.turretHp };
    return { ...common, w: 34, h: 30, hp: CONFIG.enemies.flyerHp, maxHp: CONFIG.enemies.flyerHp, baseX: spawn.x, baseY: spawn.y, range: spawn.range || 120, phase: Math.random() * Math.PI * 2 };
  }

  function makeGrowth() {
    return { maxHp: CONFIG.player.maxHp, speedMult: 1, fireRateMult: 1, bulletDamage: 1, airJumps: CONFIG.player.airJumps, dashCooldownMult: 1 };
  }
  function getSeedDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function hashString(text) {
    let hash = 2166136261;
    for (const char of text) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function makeRng(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cloneStage(stage) {
    return {
      ...stage,
      boss: { ...stage.boss },
      platforms: stage.platforms.map((platform) => ({ ...platform })),
      hazards: stage.hazards.map((hazard) => ({ ...hazard })),
      checkpoints: stage.checkpoints.map((point) => ({ ...point })),
      enemySpawns: stage.enemySpawns.map((spawn) => ({ ...spawn })),
      itemSpawns: stage.itemSpawns.map((spawn) => ({ ...spawn }))
    };
  }
  function stageCycleTheme(index) {
    const themes = ["base", "jungle", "mech"];
    return themes[index % themes.length];
  }
  function scaleBossStats(baseBoss, stageNumber) {
    if (stageNumber <= STAGES.length) return { ...baseBoss };
    const delta = stageNumber - STAGES.length;
    const hpScale = Math.pow(1.18, delta);
    const cooldownScale = Math.max(0.35, Math.pow(0.94, delta));
    const bulletSpeedScale = Math.pow(1.08, delta);
    return {
      ...baseBoss,
      hp: Math.round(baseBoss.hp * hpScale),
      damage: baseBoss.damage + Math.floor(delta / 4),
      cooldownScale,
      bulletSpeedScale
    };
  }
  function generateProceduralStage(index) {
    const stageNumber = index + 1;
    const seed = hashString(`${cleanPlayerId(game.playerId, true)}|${getSeedDate()}|${stageNumber}`);
    const rand = makeRng(seed);
    const theme = stageCycleTheme(index);
    const base = cloneStage(STAGES[0]);
    const worldLength = 2800 + Math.floor(rand() * 400);
    const areaName = ["边境试炼", "空域试炼", "钢铁试炼"][index % 3];
    const nameSeed = ["瓦尔基里", "阿瑞斯", "赫菲斯托", "巴洛尔", "奥伯龙"];
    const bossCoreName = nameSeed[Math.floor(rand() * nameSeed.length)];
    const bossName = `试炼统帅 ${bossCoreName} ${stageNumber}`;
    const bossPattern = ["burst", "fan", "summon"][Math.floor(rand() * 3)];
    const bossSpeedBase = 90 + Math.floor(rand() * 26);
    const bossBase = { hp: 52 + Math.floor(rand() * 10), damage: 2, pattern: bossPattern, speed: bossSpeedBase };
    const scaledBoss = scaleBossStats(bossBase, stageNumber);
    const platforms = base.platforms.map((platform) => {
      if (platform.y < CONFIG.groundY) {
        const yJitter = Math.floor((rand() - 0.5) * 46);
        return { ...platform, y: clamp(platform.y + yJitter, 308, 432), area: theme };
      }
      return { ...platform, area: platform.area === "boss" ? "boss" : theme };
    });
    platforms[4] = { ...platforms[4], x: Math.max(2300, worldLength - 1300), w: 1300 };
    const checkpoints = [
      { x: 80, y: 360 },
      { x: Math.floor(worldLength * 0.26), y: 350 },
      { x: Math.floor(worldLength * 0.50), y: 340 },
      { x: Math.floor(worldLength * 0.72), y: 338 },
      { x: Math.floor(worldLength * 0.86), y: 332 }
    ];
    const hazards = [];
    const hazardCount = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < hazardCount; i += 1) {
      const w = 58 + Math.floor(rand() * 36);
      const x = 620 + Math.floor(rand() * (worldLength - 1200));
      hazards.push({ x, y: 454, w, h: 24 });
    }
    const enemySpawns = [];
    const enemyCount = 7 + Math.min(8, Math.floor((stageNumber - 1) / 2));
    for (let i = 0; i < enemyCount; i += 1) {
      const roll = rand();
      const x = 520 + Math.floor(rand() * (worldLength - 900));
      if (roll < 0.45) enemySpawns.push({ type: "patrol", x, y: 436, minX: x - 120, maxX: x + 120 });
      else if (roll < 0.75) enemySpawns.push({ type: "turret", x, y: 352 + Math.floor(rand() * 40) });
      else enemySpawns.push({ type: "flyer", x, y: 200 + Math.floor(rand() * 90), range: 120 + Math.floor(rand() * 110) });
    }
    const itemSpawns = [
      { type: "health", x: 920 + Math.floor(rand() * 220), y: 420 },
      { type: rand() < 0.5 ? "rapid" : "spread", x: 1620 + Math.floor(rand() * 250), y: 340 },
      { type: "health", x: worldLength - 520, y: 320 }
    ];
    return {
      name: `TRIAL-${stageNumber}`,
      label: `${areaName} ${stageNumber}`,
      length: worldLength,
      theme,
      bossName,
      boss: scaledBoss,
      platforms,
      hazards,
      checkpoints,
      enemySpawns,
      itemSpawns
    };
  }
  function resolveStage(index) {
    if (index < STAGES.length) return STAGES[index];
    return generateProceduralStage(index);
  }
  function currentBossArena() {
    const width = 1000;
    const right = level.length;
    const x = Math.max(900, right - width);
    return { x, right };
  }
  function affixesForStage(stageNumber) {
    if (stageNumber <= STAGES.length) return [];
    const unlockedCount = Math.min(BOSS_AFFIXES.length, Math.floor((stageNumber - STAGES.length) / 3) + 1);
    const seed = hashString(`${cleanPlayerId(game.playerId, true)}|${getSeedDate()}|AFFIX|${stageNumber}`);
    const rand = makeRng(seed);
    const pool = BOSS_AFFIXES.slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, unlockedCount);
  }
  function applyBossAffixes(boss, stageNumber) {
    const affixes = affixesForStage(stageNumber);
    boss.affixes = affixes.map((affix) => affix.name);
    boss.affixSpeedMult = 1;
    boss.affixShotCooldownMult = 1;
    boss.affixExtraShots = 0;
    boss.affixBulletSpeedBonus = 0;
    boss.shieldHp = 0;
    boss.shieldMax = 0;
    boss.enrageThreshold = 0;
    boss.enrageSpeedMult = 1;
    boss.enrageShotMult = 1;
    for (const affix of affixes) affix.apply(boss);
  }

  function makeBoss() {
    const data = level.boss;
    const arena = currentBossArena();
    const boss = {
      type: "boss", bossName: level.bossName, pattern: data.pattern,
      x: arena.x + 560, y: CONFIG.groundY - 104, w: 78, h: 104,
      vx: -data.speed, vy: 0, facing: -1, hp: data.hp, maxHp: data.hp,
      shootCooldown: 1.1, summonCooldown: 4, waveCooldown: 2.5,
      summons: 0, hitFlash: 0, dead: false, active: true, damage: data.damage
    };
    applyBossAffixes(boss, game.stageIndex + 1);
    return boss;
  }

  function resetGame() {
    game.state = "menu"; game.time = 0; game.levelTime = 0; game.runTime = 0; game.stageTime = 0;
    game.score = 0; game.defeated = 0; game.stageIndex = 0; game.timeBonus = 0;
    game.stageBonus = 0; game.healthBonus = 0; game.speedBonus = 0; game.damagePenalty = 0;
    game.damageTaken = 0; game.bossDefeatedCount = 0;
    game.combo = 0; game.comboTimer = 0; game.growth = makeGrowth(); loadStage(0);
    setOverlay("menu");
  }
  function loadStage(index) {
    game.stageIndex = index; level = resolveStage(index); game.stageTime = 0;
    game.camera = { x: 0, y: 0, shake: 0 }; game.player = makePlayer();
    game.enemies = level.enemySpawns.map(makeEnemy); game.playerBullets = []; game.enemyBullets = [];
    game.particles = []; game.texts = []; game.items = level.itemSpawns.map((item) => ({ ...item, w: 24, h: 24, collected: false, bob: Math.random() * 10 }));
    game.boss = makeBoss(); game.bossActive = false; game.bossDefeated = false; game.warningTimer = 0;
    game.bossIntroTimer = 0; game.bossIntroName = "";
    game.safePoint = { ...level.checkpoints[0] }; game.scoreSaved = false;
  }
  function startRun() {
    game.playerId = readPlayerId();
    game.state = "playing";
    hideOverlay();
  }
  function setOverlay(state) {
    if ((state === "gameOver" || state === "victory") && !game.scoreSaved) saveLeaderboardEntry(state);
    const lines = {
      menu: ["SHOOTERS READY", stageCardText()],
      paused: ["游戏暂停", "战斗已暂停，可以调整手指姿势。"],
      upgrade: ["MISSION COMPLETE", stageCardText()],
      gameOver: ["任务失败", resultSummary()],
      victory: ["任务完成", resultSummary()]
    }[state];
    hud.overlayTitle.textContent = lines[0];
    hud.overlayBody.textContent = lines[1];
    renderKeyGuide(state);
    updatePlayerIdPanel(state);
    hud.overlay.dataset.state = state;
    hud.overlay.classList.remove("hidden");
    hud.upgradeOptions.classList.toggle("hidden", state !== "upgrade");
    if (state === "upgrade") renderUpgradeOptions();
    renderLeaderboard();
    refreshOnlineLeaderboard();
  }
  function hideOverlay() { hud.overlay.classList.add("hidden"); hud.upgradeOptions.classList.add("hidden"); }
  function updatePlayerIdPanel(state) {
    const isReadOnlyStage = state === "upgrade" || state === "gameOver" || state === "victory";
    const field = hud.playerId.closest(".player-id-field");
    hud.playerId.readOnly = false;
    hud.playerId.classList.remove("readonly");
    if (isReadOnlyStage) {
      if (field) field.classList.add("hidden");
      hud.playerSummary.classList.remove("hidden");
      hud.summaryPlayerId.textContent = game.playerId || "玩家1";
      hud.summaryStageTime.textContent = formatTime(game.stageTime);
      hud.summaryDefeated.textContent = String(game.defeated);
    } else {
      if (field) field.classList.remove("hidden");
      hud.playerSummary.classList.add("hidden");
      hud.playerIdLabel.textContent = "玩家 ID";
      hud.playerId.value = cleanPlayerId(game.playerId, true);
    }
  }
  function renderKeyGuide(state) {
    const groups = {
      menu: [
        ["开始", ["Enter", "J", "空格"]],
        ["移动", ["W", "A", "S", "D"], ["↑", "←", "↓", "→"], "W / ↑ / 空格 跳跃，可二段跳"],
        ["战斗", ["J", "K"], "射击 / 冲刺"]
      ],
      paused: [
        ["继续", ["P"]],
        ["重开", ["R"]],
        ["移动", ["W", "A", "S", "D"], ["↑", "←", "↓", "→"]]
      ],
      upgrade: [],
      gameOver: [
        ["重开", ["R"]],
        ["移动", ["W", "A", "S", "D"], ["↑", "←", "↓", "→"]],
        ["战斗", ["J", "K"], "射击 / 冲刺"]
      ],
      victory: [
        ["重开", ["R"]],
        ["成绩", ["在线榜"], "自动提交"],
        ["再战", ["Enter", "J", "空格"]]
      ]
    }[state] || [];
    hud.overlaySub.replaceChildren(...groups.map(makeKeyGroup));
  }
  function stageCardText() {
    return `STAGE ${game.stageIndex + 1}/∞ - ${level.label}`;
  }
  function makeKeyGroup(group) {
    const wrap = document.createElement("div");
    wrap.className = "key-group";
    const label = document.createElement("div");
    label.className = "key-group-label";
    label.textContent = group[0];
    wrap.append(label, makeKeyRow(group[1]));
    if (Array.isArray(group[2])) wrap.append(makeKeyRow(group[2]));
    const noteText = Array.isArray(group[2]) ? group[3] : group[2];
    if (noteText) {
      const note = document.createElement("div");
      note.className = "key-note";
      note.textContent = noteText;
      wrap.append(note);
    }
    return wrap;
  }
  function makeKeyRow(keys) {
    const row = document.createElement("div");
    row.className = "key-row";
    for (const key of keys) {
      const keycap = document.createElement("span");
      keycap.className = key.length > 2 ? "keycap keycap-wide" : "keycap";
      keycap.textContent = key;
      row.append(keycap);
    }
    return row;
  }
  function formatTime(seconds) { return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`; }
  function cleanPlayerId(value, fallback = false) {
    const cleaned = Array.from(value || "")
      .map((char) => /[a-z]/.test(char) ? char.toUpperCase() : char)
      .filter((char) => /[\p{Script=Han}A-Z0-9_-]/u.test(char))
      .slice(0, 16)
      .join("");
    return fallback && !cleaned ? "玩家1" : cleaned;
  }
  function readPlayerId() {
    const playerId = cleanPlayerId(hud.playerId.value, true);
    hud.playerId.value = playerId;
    try {
      localStorage.setItem(CONFIG.leaderboard.playerKey, playerId);
    } catch {
      return playerId;
    }
    return playerId;
  }
  function loadPlayerId() {
    try {
      return cleanPlayerId(localStorage.getItem(CONFIG.leaderboard.playerKey), true);
    } catch {
      return "玩家1";
    }
  }
  function initPlayerId() {
    game.playerId = loadPlayerId();
    hud.playerId.value = game.playerId;
    hud.playerId.addEventListener("input", () => {
      const cursor = hud.playerId.selectionStart;
      hud.playerId.value = cleanPlayerId(hud.playerId.value);
      hud.playerId.setSelectionRange(cursor, cursor);
    });
    hud.playerId.addEventListener("change", readPlayerId);
    hud.playerId.addEventListener("keydown", (event) => {
      if (event.code !== "Enter" || game.state !== "menu") return;
      event.preventDefault();
      startRun();
    });
  }
  function resultSummary() {
    return `${game.playerId} - 分数 ${game.score} - 最高关 ${game.stageIndex + 1} - 用时 ${formatTime(game.runTime)} - 击败 ${game.defeated} - Boss ${game.bossDefeatedCount}`;
  }
  function awardTimeBonus() {
    game.timeBonus = Math.max(0, Math.floor((CONFIG.scoring.runTimePar - game.runTime) * CONFIG.scoring.timeBonusPerSecond));
    game.score += game.timeBonus;
    if (game.timeBonus > 0) showText(`时间奖励 +${game.timeBonus}`, game.player.x - 25, game.player.y - 44, "#fde68a", 1.8);
  }
  function awardStageCompletionBonus() {
    const stageNumber = game.stageIndex + 1;
    const stageClear = CONFIG.scoring.stageClearBase + game.stageIndex * CONFIG.scoring.stageClearStep;
    const healthBonus = game.player.hp * CONFIG.scoring.healthBonusPerHp;
    const speedBonus = Math.max(0, Math.floor((CONFIG.scoring.stagePar - game.stageTime) * CONFIG.scoring.speedBonusPerSecond));
    const penalty = game.damageTaken * CONFIG.scoring.damagePenaltyPerHp;
    const total = Math.max(0, stageClear + healthBonus + speedBonus - penalty);
    game.stageBonus += stageClear;
    game.healthBonus += healthBonus;
    game.speedBonus += speedBonus;
    game.damagePenalty += penalty;
    game.score += total;
    showText(`第${stageNumber}关结算 +${total}`, game.player.x - 30, game.player.y - 46, "#fde68a", 1.4);
    game.damageTaken = 0;
  }
  function chooseUpgrade(id) {
    const p = game.player;
    if (id === "maxHp") { game.growth.maxHp += 1; p.maxHp = game.growth.maxHp; p.hp = Math.min(p.maxHp, p.hp + 1); }
    if (id === "speed") game.growth.speedMult *= 1.1;
    if (id === "fireRate") game.growth.fireRateMult *= 0.85;
    if (id === "bullet") game.growth.bulletDamage += 1;
    if (id === "airJump") game.growth.airJumps += 1;
    if (id === "dash") game.growth.dashCooldownMult *= 0.78;
    loadStage(game.stageIndex + 1);
    game.state = "playing";
    hideOverlay();
    showText(`强化: ${UPGRADES.find((upgrade) => upgrade.id === id).name}`, game.player.x + 20, game.player.y - 22, "#fde68a", 1.6);
  }
  function renderUpgradeOptions() {
    hud.upgradeOptions.replaceChildren();
    game.upgradeChoices = UPGRADES.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    for (const upgrade of game.upgradeChoices) {
      const button = document.createElement("button");
      button.className = "upgrade-option";
      button.type = "button";
      const name = document.createElement("span");
      name.className = "upgrade-name";
      name.textContent = upgrade.name;
      const desc = document.createElement("span");
      desc.className = "upgrade-desc";
      desc.textContent = upgrade.desc;
      button.append(name, desc);
      button.addEventListener("click", () => chooseUpgrade(upgrade.id));
      hud.upgradeOptions.append(button);
    }
  }
  function loadLeaderboard() {
    try {
      const entries = JSON.parse(localStorage.getItem(CONFIG.leaderboard.key) || "[]");
      return Array.isArray(entries) ? entries.filter((entry) => Number.isFinite(entry.score)) : [];
    } catch {
      return [];
    }
  }
  function saveLeaderboardEntry(result) {
    game.scoreSaved = true;
    game.playerId = readPlayerId();
    const entry = {
      playerId: game.playerId,
      score: game.score,
      time: Math.round(game.levelTime),
      runTime: Math.round(game.runTime),
      timeBonus: game.timeBonus,
      stage: game.stageIndex + 1,
      highestStage: game.stageIndex + 1,
      bossDefeated: game.bossDefeatedCount,
      damageTaken: game.damagePenalty,
      defeated: game.defeated,
      result,
      date: new Date().toLocaleDateString()
    };
    const entries = loadLeaderboard();
    entries.push(entry);
    entries.sort((a, b) => b.score - a.score || a.time - b.time);
    try {
      localStorage.setItem(CONFIG.leaderboard.key, JSON.stringify(entries.slice(0, CONFIG.leaderboard.maxEntries)));
    } catch {
      return;
    }
    submitOnlineScore(entry);
  }
  function renderLeaderboard(entries = loadLeaderboard(), mode = game.leaderboardMode) {
    const title = document.createElement("div");
    title.className = "leaderboard-title";
    title.textContent = `${mode === "online" ? "在线" : "本地"}排行榜`;
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "leaderboard-empty";
      empty.textContent = "暂无成绩。";
      hud.leaderboard.replaceChildren(title, empty);
      return;
    }
    const list = document.createElement("ol");
    list.className = "leaderboard-list";
    for (const entry of entries) {
      const result = entry.result === "victory" ? "通关" : "失败";
      const highestStage = entry.highestStage || entry.stage || 1;
      const bossDefeated = entry.bossDefeated || 0;
      const row = document.createElement("li");
      row.textContent = `${entry.playerId || "玩家"} - ${entry.score} 分 - 关卡 ${highestStage} - ${result} - ${formatTime(entry.runTime || entry.time || 0)} - 击败 ${entry.defeated || 0} - Boss ${bossDefeated}`;
      list.append(row);
    }
    const status = document.createElement("div");
    status.className = "leaderboard-status";
    status.textContent = CONFIG.leaderboard.apiUrl ? "在线服务可用时会同步成绩。" : "配置 CONFIG.leaderboard.apiUrl 后启用在线排行榜。";
    hud.leaderboard.replaceChildren(title, list, status);
    setupLeaderboardScroll();
  }
  function setupLeaderboardScroll() {
    if (!leaderboardScroll.initialized) {
      hud.leaderboard.addEventListener("pointerenter", () => { leaderboardScroll.paused = true; });
      hud.leaderboard.addEventListener("pointerleave", () => { leaderboardScroll.paused = false; });
      hud.leaderboard.addEventListener("wheel", () => { leaderboardScroll.paused = true; });
      leaderboardScroll.initialized = true;
    }
    const canScroll = hud.leaderboard.scrollHeight > hud.leaderboard.clientHeight + 6;
    if (!canScroll) {
      if (leaderboardScroll.rafId) cancelAnimationFrame(leaderboardScroll.rafId);
      leaderboardScroll.rafId = 0;
      leaderboardScroll.lastTime = 0;
      hud.leaderboard.scrollTop = 0;
      return;
    }
    if (!leaderboardScroll.rafId) {
      leaderboardScroll.paused = false;
      leaderboardScroll.lastTime = 0;
      leaderboardScroll.rafId = requestAnimationFrame(tickLeaderboardAutoScroll);
    }
  }
  function tickLeaderboardAutoScroll(now) {
    if (!leaderboardScroll.lastTime) leaderboardScroll.lastTime = now;
    const dt = now - leaderboardScroll.lastTime;
    leaderboardScroll.lastTime = now;
    const canScroll = hud.leaderboard.scrollHeight > hud.leaderboard.clientHeight + 6;
    if (!canScroll) {
      leaderboardScroll.rafId = 0;
      leaderboardScroll.lastTime = 0;
      return;
    }
    if (!leaderboardScroll.paused) {
      const speedPxPerSecond = 24;
      hud.leaderboard.scrollTop += (speedPxPerSecond * dt) / 1000;
      const maxScroll = hud.leaderboard.scrollHeight - hud.leaderboard.clientHeight;
      if (hud.leaderboard.scrollTop >= maxScroll - 1) hud.leaderboard.scrollTop = 0;
    }
    leaderboardScroll.rafId = requestAnimationFrame(tickLeaderboardAutoScroll);
  }
  async function refreshOnlineLeaderboard() {
    if (!CONFIG.leaderboard.apiUrl) return;
    try {
      const response = await fetch(`${CONFIG.leaderboard.apiUrl.replace(/\/$/, "")}/scores?limit=${CONFIG.leaderboard.maxEntries}`);
      if (!response.ok) throw new Error("Leaderboard request failed");
      const data = await response.json();
      const entries = Array.isArray(data.scores) ? data.scores : [];
      game.leaderboardMode = "online";
      renderLeaderboard(entries, "online");
    } catch {
      game.leaderboardMode = "local";
      renderLeaderboard(loadLeaderboard(), "local");
    }
  }
  async function submitOnlineScore(entry) {
    if (!CONFIG.leaderboard.apiUrl) return;
    try {
      await fetch(`${CONFIG.leaderboard.apiUrl.replace(/\/$/, "")}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      });
      refreshOnlineLeaderboard();
    } catch {
      game.leaderboardMode = "local";
    }
  }
  function aabb(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function rectFor(e) { return { x: e.x, y: e.y, w: e.w, h: e.h }; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function signNonZero(value, fallback = 1) { return value > 0 ? 1 : value < 0 ? -1 : fallback; }
  function collidesWithPlatforms(rect) { return level.platforms.some((platform) => aabb(rect, platform)); }
  function canStand(player) {
    const bottom = player.y + player.h;
    return !collidesWithPlatforms({ x: player.x, y: bottom - player.standH, w: player.w, h: player.standH });
  }

  function moveWithPlatforms(entity, dt) {
    entity.x += entity.vx * dt;
    const xRect = rectFor(entity);
    for (const platform of level.platforms) {
      if (!aabb(xRect, platform)) continue;
      if (entity.vx > 0) entity.x = platform.x - entity.w;
      if (entity.vx < 0) entity.x = platform.x + platform.w;
      entity.vx = 0; xRect.x = entity.x;
    }
    entity.y += entity.vy * dt;
    entity.grounded = false;
    const yRect = rectFor(entity);
    for (const platform of level.platforms) {
      if (!aabb(yRect, platform)) continue;
      if (entity.vy > 0) { entity.y = platform.y - entity.h; entity.grounded = true; }
      else if (entity.vy < 0) entity.y = platform.y + platform.h;
      entity.vy = 0; yRect.y = entity.y;
    }
  }

  function updatePlayer(dt) {
    const p = game.player;
    p.shootCooldown = Math.max(0, p.shootCooldown - dt); p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.dashTimer = Math.max(0, p.dashTimer - dt); p.damageInvuln = Math.max(0, p.damageInvuln - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt); p.muzzleFlash = Math.max(0, p.muzzleFlash - dt);
    if (p.weaponTimer > 0) { p.weaponTimer = Math.max(0, p.weaponTimer - dt); if (p.weaponTimer === 0) p.weaponType = "normal"; }
    if (input.wasPressed("up")) p.jumpBuffer = CONFIG.player.jumpBuffer;
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);

    const wantCrouch = input.isDown("down") && p.grounded && p.dashTimer <= 0;
    if (wantCrouch && !p.crouching) { const bottom = p.y + p.h; p.h = p.crouchH; p.y = bottom - p.h; p.crouching = true; }
    else if (!wantCrouch && p.crouching && canStand(p)) { const bottom = p.y + p.h; p.h = p.standH; p.y = bottom - p.h; p.crouching = false; }

    if (input.wasPressed("dash") && p.dashCooldown <= 0) {
      p.dashTimer = CONFIG.player.dashDuration; p.dashCooldown = CONFIG.player.dashCooldown * game.growth.dashCooldownMult;
      p.vx = p.facing * CONFIG.player.dashSpeed; p.vy *= 0.35;
      addParticles(p.x + p.w / 2, p.y + p.h / 2, "#67e8f9", 12, 160); tone("dash");
    }

    const move = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
    if (move !== 0) p.facing = move;
    if (p.dashTimer <= 0) {
      const maxSpeed = (p.crouching ? CONFIG.player.crouchSpeed : CONFIG.player.maxSpeed) * game.growth.speedMult;
      if (move !== 0) { p.vx += move * CONFIG.player.acceleration * game.growth.speedMult * dt; p.vx = clamp(p.vx, -maxSpeed, maxSpeed); }
      else { const friction = CONFIG.player.friction * dt; if (Math.abs(p.vx) <= friction) p.vx = 0; else p.vx -= Math.sign(p.vx) * friction; }
    }
    if (p.grounded) { p.coyote = CONFIG.player.coyoteTime; p.airJumpsRemaining = game.growth.airJumps; }
    else p.coyote = Math.max(0, p.coyote - dt);
    if (p.jumpBuffer > 0 && !p.crouching) {
      const canGroundJump = p.coyote > 0;
      const canAirJump = !canGroundJump && p.airJumpsRemaining > 0;
      if (canGroundJump || canAirJump) {
        p.vy = canAirJump ? CONFIG.player.jumpVelocity * 0.92 : CONFIG.player.jumpVelocity;
        p.grounded = false; p.coyote = 0; p.jumpBuffer = 0;
        if (canAirJump) p.airJumpsRemaining -= 1;
        addParticles(p.x + p.w / 2, p.y + p.h, canAirJump ? "#93c5fd" : "#e0f2fe", canAirJump ? 12 : 8, 90); tone("jump");
      }
    }
    if (input.wasReleased("up") && p.vy < -160) p.vy = -160;
    p.vy += CONFIG.player.gravity * (p.dashTimer <= 0 ? 1 : 0.18) * dt;
    p.vy = Math.min(p.vy, CONFIG.player.maxFallSpeed);
    moveWithPlatforms(p, dt); p.x = clamp(p.x, 0, level.length - p.w);
    if (game.bossActive && !game.bossDefeated) {
      const arena = currentBossArena();
      p.x = clamp(p.x, arena.x + 24, arena.right - p.w - 36);
    }
    updateSafePoint();
    if (level.hazards.some((hazard) => aabb(p, hazard)) || p.y > CONFIG.killY) hazardRespawn();
    if (input.isDown("shoot")) shootPlayer();
    if (Math.abs(p.vx) > 10 && p.grounded) p.walkClock += dt * Math.abs(p.vx) * 0.05;
  }

  function updateSafePoint() {
    let best = game.safePoint;
    for (const checkpoint of level.checkpoints) if (game.player.x >= checkpoint.x) best = checkpoint;
    if (best.x > game.safePoint.x) {
      game.safePoint = { ...best };
      showText("检查点", best.x - 18, best.y - 28, "#bbf7d0", 0.9);
    }
  }
  function isSafeRespawn(point) {
    const rect = { x: point.x, y: point.y, w: CONFIG.player.width, h: CONFIG.player.standHeight };
    const footY = point.y + CONFIG.player.standHeight;
    const hasFloor = Boolean(platformUnderPoint(point));
    return point.y < CONFIG.killY && !level.hazards.some((hazard) => aabb(rect, hazard)) && hasFloor;
  }
  function platformUnderPoint(point) {
    const footY = point.y + CONFIG.player.standHeight;
    return level.platforms.find((platform) => footY <= platform.y + 4 && footY >= platform.y - 12 && point.x + CONFIG.player.width > platform.x && point.x < platform.x + platform.w);
  }
  function findSafeRespawnPoint() {
    const sorted = level.checkpoints.filter((checkpoint) => checkpoint.x <= game.safePoint.x).reverse();
    for (const checkpoint of sorted) if (isSafeRespawn(checkpoint)) return checkpoint;
    return level.checkpoints[0];
  }
  function hazardRespawn() {
    const p = game.player;
    if (p.damageInvuln > 0) return;
    damagePlayer(1, "地形伤害");
    if (game.state !== "playing") return;
    const point = findSafeRespawnPoint();
    game.safePoint = { ...point };
    p.x = point.x; p.y = point.y; p.vx = 0; p.vy = 0; p.h = p.standH; p.crouching = false; p.airJumpsRemaining = game.growth.airJumps;
    showText("复活", p.x - 12, p.y - 28, "#bae6fd", 1.0);
  }
  function shootPlayer() {
    const p = game.player;
    const interval = (p.weaponType === "rapid" ? CONFIG.player.rapidInterval : CONFIG.player.shootInterval) * game.growth.fireRateMult;
    if (p.shootCooldown > 0) return;
    p.shootCooldown = interval; p.muzzleFlash = 0.055;
    const originX = p.x + (p.facing > 0 ? p.w + 3 : -9);
    const originY = p.y + (p.crouching ? 15 : 21);
    const angles = p.weaponType === "spread" ? [-0.18, 0, 0.18] : [0];
    for (const angle of angles) game.playerBullets.push({ x: originX, y: originY, w: 12, h: 5, vx: Math.cos(angle) * CONFIG.player.bulletSpeed * p.facing, vy: Math.sin(angle) * CONFIG.player.bulletSpeed, damage: game.growth.bulletDamage, life: 1.2 });
    addParticles(originX, originY, "#fde047", 4, 90); tone("shoot");
  }
  function damagePlayer(amount, reason = "受击") {
    const p = game.player;
    if (p.damageInvuln > 0 || p.dashTimer > 0 || game.state !== "playing") return;
    p.hp -= amount; p.damageInvuln = CONFIG.player.damageInvuln; p.hitFlash = 0.18;
    game.damageTaken += amount;
    game.camera.shake = Math.max(game.camera.shake, amount > 1 ? 12 : 8);
    addParticles(p.x + p.w / 2, p.y + p.h / 2, "#fda4af", 16, 150); tone("hurt");
    showText(`${reason} -${amount}`, p.x - 8, p.y - 24, "#fda4af", 0.9);
    if (p.hp <= 0) { p.hp = 0; game.state = "gameOver"; setOverlay("gameOver"); }
  }

  function enemyShoot(enemy, count = 1, spread = 0) {
    const p = game.player, fromX = enemy.x + enemy.w / 2, fromY = enemy.y + enemy.h * 0.45;
    const base = Math.atan2(p.y + p.h * 0.5 - fromY, p.x + p.w / 2 - fromX);
    for (let i = 0; i < count; i += 1) {
      const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
      const angle = base + offset;
      const speed = enemy.type === "boss"
        ? 185 + game.stageIndex * 28 + (enemy.affixBulletSpeedBonus || 0)
        : CONFIG.enemies.enemyBulletSpeed;
      game.enemyBullets.push({ x: fromX - 3, y: fromY - 3, w: 7, h: 7, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage: enemy.type === "boss" ? enemy.damage : 1, life: 5, color: enemy.type === "boss" ? "#c084fc" : "#fb7185" });
    }
  }
  function bossRadialShot(boss, count, speed = 165) {
    const fromX = boss.x + boss.w / 2, fromY = boss.y + boss.h * 0.45;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + game.time * 0.25;
      game.enemyBullets.push({ x: fromX, y: fromY, w: 6, h: 6, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage: boss.damage, life: 4.5, color: "#f0abfc" });
    }
  }

  function updateEnemies(dt) {
    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      enemy.active = enemy.active || Math.abs(enemy.x - game.player.x) < CONFIG.enemies.activateDistance;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      if (!enemy.active) continue;
      if (enemy.type === "patrol") updatePatrol(enemy, dt);
      if (enemy.type === "turret") updateTurret(enemy, dt);
      if (enemy.type === "flyer") updateFlyer(enemy, dt);
    }
    if (game.bossActive && game.boss && !game.boss.dead) updateBoss(dt);
  }

  function updatePatrol(enemy, dt) {
    const p = game.player;
    const close = Math.abs(p.x - enemy.x) < CONFIG.enemies.patrolShootRange && Math.abs(p.y - enemy.y) < 130;
    enemy.shootCooldown -= dt;
    if (close) {
      enemy.vx = 0; enemy.facing = p.x < enemy.x ? -1 : 1;
      if (enemy.shootCooldown <= 0) { enemyShoot(enemy); enemy.shootCooldown = 1.45 + Math.random() * 0.35; }
    } else {
      if (enemy.vx === 0) enemy.vx = enemy.facing * CONFIG.enemies.patrolSpeed;
      enemy.x += enemy.vx * dt;
      if (enemy.x < enemy.minX) { enemy.x = enemy.minX; enemy.vx = CONFIG.enemies.patrolSpeed; }
      if (enemy.x > enemy.maxX) { enemy.x = enemy.maxX; enemy.vx = -CONFIG.enemies.patrolSpeed; }
      enemy.facing = signNonZero(enemy.vx, enemy.facing);
    }
  }
  function updateTurret(enemy, dt) {
    const p = game.player;
    enemy.facing = p.x < enemy.x ? -1 : 1; enemy.shootCooldown -= dt;
    if (Math.abs(p.x - enemy.x) < CONFIG.enemies.turretShootRange && enemy.shootCooldown <= 0) { enemyShoot(enemy); enemy.shootCooldown = 1.15; }
  }
  function updateFlyer(enemy, dt) {
    const p = game.player;
    enemy.phase += dt * 1.8; enemy.x = enemy.baseX + Math.sin(enemy.phase) * enemy.range; enemy.y = enemy.baseY + Math.sin(enemy.phase * 1.7) * 34;
    enemy.facing = p.x < enemy.x ? -1 : 1; enemy.shootCooldown -= dt;
    if (Math.abs(p.x - enemy.x) < CONFIG.enemies.flyerShootRange && enemy.shootCooldown <= 0) { enemyShoot(enemy); enemy.shootCooldown = 1.7; }
  }
  function updateBoss(dt) {
    const boss = game.boss;
    const arena = currentBossArena();
    const ratio = boss.hp / boss.maxHp;
    const stage = ratio < 0.3 ? 3 : ratio < 0.6 ? 2 : 1;
    boss.hitFlash = Math.max(0, boss.hitFlash - dt); boss.shootCooldown -= dt; boss.summonCooldown -= dt;
    const enrageMult = boss.enrageThreshold > 0 && ratio <= boss.enrageThreshold ? boss.enrageSpeedMult : 1;
    const phaseSpeed = stage === 3 ? level.boss.speed * 1.3 : level.boss.speed;
    const signedSpeed = phaseSpeed * (boss.vx < 0 ? -1 : 1);
    const speed = signedSpeed * boss.affixSpeedMult * enrageMult;
    boss.x += boss.vx * dt;
    if (boss.x < arena.x + 420) { boss.x = arena.x + 420; boss.vx = Math.abs(speed); }
    if (boss.x > arena.right - 150) { boss.x = arena.right - 150; boss.vx = -Math.abs(speed); }
    boss.facing = game.player.x < boss.x ? -1 : 1;
    const enrageShotMult = boss.enrageThreshold > 0 && ratio <= boss.enrageThreshold ? boss.enrageShotMult : 1;
    const shotMult = boss.affixShotCooldownMult * enrageShotMult;
    if (boss.shootCooldown <= 0) {
      if (boss.pattern === "burst") { enemyShoot(boss, stage + boss.affixExtraShots, 0.18); boss.shootCooldown = (stage === 3 ? 0.82 : 1.05) * shotMult; }
      if (boss.pattern === "fan") { enemyShoot(boss, 3 + stage + boss.affixExtraShots, 0.18); boss.shootCooldown = (1.15 - stage * 0.08) * shotMult; }
      if (boss.pattern === "summon") { enemyShoot(boss, 3 + boss.affixExtraShots, 0.25); bossRadialShot(boss, 6 + stage * 2 + boss.affixExtraShots, 150 + stage * 22 + boss.affixBulletSpeedBonus); boss.shootCooldown = (1.45 - stage * 0.12) * shotMult; }
    }
    if ((stage === 3 || boss.pattern === "summon") && boss.summonCooldown <= 0 && boss.summons < 2 + game.stageIndex) {
      boss.summons += 1; boss.summonCooldown = 5;
      const minX = arena.x + 80, maxX = arena.x + 340;
      game.enemies.push(makeEnemy({ type: "patrol", x: minX + 80 * boss.summons, y: 436, minX, maxX }));
      showText("REINFORCEMENTS", boss.x - 80, boss.y - 30, "#fca5a5");
    }
  }

  function updateBossTrigger(dt) {
    const p = game.player;
    const arena = currentBossArena();
    if (!game.bossActive && game.state === "playing" && p.x > arena.x + 40) {
      game.state = "bossIntro";
      game.bossIntroTimer = 2.2;
      if (game.boss) {
        const affixText = game.boss.affixes && game.boss.affixes.length ? ` [${game.boss.affixes.join(" / ")}]` : "";
        game.bossIntroName = `${game.boss.bossName}${affixText}`;
      } else {
        game.bossIntroName = level.bossName;
      }
      game.warningTimer = game.bossIntroTimer;
      game.camera.shake = 5;
      showText("BOSS INCOMING", p.x + 80, 170, "#f43f5e", 1.2);
      tone("warning");
      return;
    }
    game.warningTimer = Math.max(0, game.warningTimer - dt);
  }

  function updateBullets(dt) {
    for (const bullet of game.playerBullets) { bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt; }
    for (const bullet of game.enemyBullets) { bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt; }
    handleBulletHits();
    const left = game.camera.x - 180, right = game.camera.x + CONFIG.width + 180;
    game.playerBullets = game.playerBullets.filter((b) => b.life > 0 && b.x > left && b.x < right && !collidesWithPlatforms(b));
    game.enemyBullets = game.enemyBullets.filter((b) => b.life > 0 && b.x > left && b.x < right && !collidesWithPlatforms(b));
  }

  function handleBulletHits() {
    for (const bullet of game.playerBullets) {
      if (bullet.dead) continue;
      for (const enemy of livingTargets()) {
        if (!aabb(bullet, enemy)) continue;
        bullet.dead = true; damageEnemy(enemy, bullet.damage); addParticles(bullet.x, bullet.y, "#fef08a", 8, 120); break;
      }
    }
    game.playerBullets = game.playerBullets.filter((bullet) => !bullet.dead);
    for (const bullet of game.enemyBullets) {
      if (!aabb(bullet, game.player)) continue;
      bullet.dead = true; damagePlayer(bullet.damage, "中弹");
    }
    game.enemyBullets = game.enemyBullets.filter((bullet) => !bullet.dead);
    for (const enemy of livingTargets()) if (aabb(game.player, enemy)) damagePlayer(enemy.type === "boss" ? enemy.damage : 1, enemy.type === "boss" ? "首领碰撞" : "碰撞");
  }
  function livingTargets() {
    const targets = game.enemies.filter((enemy) => !enemy.dead);
    if (game.bossActive && game.boss && !game.boss.dead) targets.push(game.boss);
    return targets;
  }
  function damageEnemy(enemy, amount) {
    if (enemy.type === "boss" && enemy.shieldHp > 0) {
      enemy.shieldHp = Math.max(0, enemy.shieldHp - amount);
      addParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h * 0.4, "#60a5fa", 8, 90);
      showText("护盾吸收", enemy.x - 20, enemy.y - 18, "#93c5fd", 0.6);
      if (enemy.shieldHp > 0) return;
      showText("护盾破碎", enemy.x - 18, enemy.y - 28, "#bfdbfe", 0.8);
    }
    enemy.hp -= amount; enemy.hitFlash = 0.08;
    if (enemy.hp > 0) return;
    enemy.dead = true; game.defeated += 1;
    const baseScore = enemy.type === "boss" ? 1800 + game.stageIndex * 700 : 100;
    if (enemy.type !== "boss") {
      game.combo = game.comboTimer > 0 ? game.combo + 1 : 1;
      game.comboTimer = CONFIG.scoring.comboWindow;
      const comboBonus = Math.max(0, game.combo - 1) * 25;
      game.score += baseScore + comboBonus;
      if (comboBonus > 0) showText(`连击 x${game.combo} +${comboBonus}`, enemy.x - 18, enemy.y - 24, "#fde68a", 0.9);
    } else {
      game.bossDefeatedCount += 1;
      game.score += baseScore;
    }
    addExplosion(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, enemy.type === "boss" ? 42 : 20); tone("boom");
    if (enemy.type === "boss") finishStage();
  }
  function finishStage() {
    game.bossDefeated = true;
    awardStageCompletionBonus();
    awardTimeBonus();
    game.state = "upgrade";
    setOverlay("upgrade");
  }

  function updateItems(dt) {
    for (const item of game.items) {
      if (item.collected) continue;
      item.bob += dt * 4;
      const rect = { x: item.x, y: item.y + Math.sin(item.bob) * 5, w: item.w, h: item.h };
      if (!aabb(game.player, rect)) continue;
      item.collected = true;
      if (item.type === "health") { game.player.hp = Math.min(game.player.maxHp, game.player.hp + 1); showText("维修 +1", item.x - 18, item.y - 18, "#bbf7d0"); }
      else { game.player.weaponType = item.type; game.player.weaponTimer = item.type === "rapid" ? CONFIG.player.rapidDuration : CONFIG.player.spreadDuration; showText(item.type === "rapid" ? "快速射击!" : "三向射击!", item.x - 28, item.y - 22, "#fde68a"); }
      addParticles(item.x + 12, item.y + 12, "#a7f3d0", 18, 120); game.score += 50; tone("pickup");
    }
  }

  function updateParticles(dt) {
    for (const p of game.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.gravity || 0) * dt; }
    game.particles = game.particles.filter((p) => p.life > 0);
    for (const text of game.texts) { text.life -= dt; text.y -= 28 * dt; }
    game.texts = game.texts.filter((text) => text.life > 0);
  }
  function addParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2, force = speed * (0.35 + Math.random() * 0.65);
      game.particles.push({ x, y, vx: Math.cos(angle) * force, vy: Math.sin(angle) * force, size: 2 + Math.random() * 3, color, life: 0.25 + Math.random() * 0.35, maxLife: 0.55, gravity: 220 });
    }
  }
  function addExplosion(x, y, size) { addParticles(x, y, "#fb7185", size, 190); addParticles(x, y, "#fde047", Math.ceil(size * 0.55), 150); }
  function showText(text, x, y, color, life = 1.0) { game.texts.push({ text, x, y, color, life, maxLife: life }); }

  function updateCamera(dt) {
    const arena = currentBossArena();
    let targetX = game.player.x + game.player.w / 2 - CONFIG.width * CONFIG.camera.lead;
    targetX = clamp(targetX, 0, level.length - CONFIG.width);
    if (game.bossActive && !game.bossDefeated) targetX = clamp(targetX, arena.x, arena.right - CONFIG.width);
    game.camera.x += (targetX - game.camera.x) * Math.min(1, CONFIG.camera.lerp * dt);
    game.camera.shake = Math.max(0, game.camera.shake - 30 * dt);
  }

  function updateHud() {
    const hpFull = "#".repeat(game.player.hp), hpEmpty = "-".repeat(game.player.maxHp - game.player.hp);
    hud.health.textContent = `生命 [${hpFull}${hpEmpty}]`;
    const weaponNames = { normal: "普通武器", rapid: "快速射击", spread: "三向射击" };
    const weapon = game.player.weaponType === "normal" ? weaponNames.normal : `${weaponNames[game.player.weaponType]} ${game.player.weaponTimer.toFixed(1)}秒`;
    const stageLabel = `第 ${game.stageIndex + 1}/∞ 关`;
    hud.weapon.textContent = `${stageLabel} ${level.label} | ${weapon}`;
    hud.score.textContent = `分数: ${game.score}  用时: ${formatTime(game.runTime)}`;
    if (game.bossActive && game.boss && !game.boss.dead) { hud.bossWrap.classList.remove("hidden"); hud.bossWrap.querySelector("span").textContent = game.boss.bossName; hud.bossFill.style.width = `${Math.max(0, game.boss.hp / game.boss.maxHp) * 100}%`; }
    else hud.bossWrap.classList.add("hidden");
    hud.debug.textContent = CONFIG.debug.enabled ? `帧率 ${game.fps}\n位置X ${Math.round(game.player.x)}  位置Y ${Math.round(game.player.y)}\n速度X ${Math.round(game.player.vx)}  速度Y ${Math.round(game.player.vy)}` : "";
  }

  function updateState(dt) {
    if (input.wasPressed("debug")) CONFIG.debug.enabled = !CONFIG.debug.enabled;
    if (game.state === "menu") { if (input.wasPressed("start")) startRun(); return; }
    if (input.wasPressed("restart")) { resetGame(); startRun(); return; }
    if (game.state === "gameOver" || game.state === "victory" || game.state === "upgrade") return;
    if (game.state === "bossIntro") {
      game.time += dt;
      game.warningTimer = Math.max(0, game.warningTimer - dt);
      game.bossIntroTimer = Math.max(0, game.bossIntroTimer - dt);
      if (game.bossIntroTimer === 0) {
        game.state = "playing";
        game.bossActive = true;
        game.warningTimer = 1.1;
        game.camera.shake = 8;
        showText(`BOSS: ${game.bossIntroName}`, game.player.x + 35, 170, "#fca5a5", 1.4);
        tone("warning");
      }
      updateCamera(dt);
      updateParticles(dt);
      return;
    }
    if (input.wasPressed("pause")) {
      if (game.state === "playing") { game.state = "paused"; setOverlay("paused"); }
      else if (game.state === "paused") { game.state = "playing"; hideOverlay(); }
      return;
    }
    if (game.state !== "playing") return;
    game.levelTime += dt; game.runTime += dt; game.stageTime += dt; game.time += dt; game.comboTimer = Math.max(0, game.comboTimer - dt);
    updateBossTrigger(dt); updatePlayer(dt); updateEnemies(dt); updateBullets(dt); updateItems(dt); updateParticles(dt); updateCamera(dt);
  }

  function areaAt(x) { if (x >= 3300) return "boss"; return level.theme; }
  function draw() {
    ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
    const shake = game.camera.shake, sx = shake > 0 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); drawBackground();
    ctx.save(); ctx.translate(-Math.round(game.camera.x), 0);
    drawLevel(); drawCheckpoints(); drawItems(); drawBullets(game.playerBullets, true); drawBullets(game.enemyBullets, false); drawEnemies(); drawPlayer(); drawParticles(); drawFloatingText();
    if (CONFIG.debug.enabled) drawDebugBoxes();
    ctx.restore();
    if (game.state === "bossIntro") drawBossIntro();
    else if (game.warningTimer > 0) drawWarning();
    ctx.restore();
  }

  function drawBackground() {
    const area = areaAt(game.camera.x + CONFIG.width / 2);
    const palette = { base: ["#0b1020", "#172554", "#334155"], jungle: ["#07170f", "#14532d", "#365314"], mech: ["#111827", "#374151", "#7c2d12"], boss: ["#1f1020", "#4c0519", "#7f1d1d"] }[area];
    const grad = ctx.createLinearGradient(0, 0, 0, CONFIG.height);
    grad.addColorStop(0, palette[0]); grad.addColorStop(0.62, palette[1]); grad.addColorStop(1, "#020617");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    drawParallaxLayer(0.18, 110, palette[2], 90); drawParallaxLayer(0.38, 210, "rgba(15, 23, 42, 0.78)", 56);
    for (let i = -1; i < 9; i += 1) {
      const x = Math.floor(i * 190 - (game.camera.x * 0.62) % 190);
      ctx.fillStyle = area === "jungle" ? "rgba(22, 101, 52, 0.35)" : "rgba(148, 163, 184, 0.18)";
      ctx.fillRect(x, 270 + (i % 2) * 24, 18, 150); ctx.fillRect(x - 22, 302, 72, 10);
    }
  }
  function drawParallaxLayer(speed, baseY, color, height) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, CONFIG.height);
    for (let i = -1; i < 11; i += 1) {
      const worldX = i * 130 - (game.camera.x * speed) % 130, peakY = baseY + ((i * 37) % 70);
      ctx.lineTo(worldX, peakY); ctx.lineTo(worldX + 72, peakY - height); ctx.lineTo(worldX + 130, peakY);
    }
    ctx.lineTo(CONFIG.width, CONFIG.height); ctx.closePath(); ctx.fill();
  }
  function drawLevel() {
    for (const platform of level.platforms) {
      const colors = { base: ["#475569", "#94a3b8"], jungle: ["#166534", "#84cc16"], mech: ["#57534e", "#f97316"], boss: ["#7f1d1d", "#f43f5e"] }[platform.area || "base"];
      ctx.fillStyle = colors[0]; ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
      ctx.fillStyle = colors[1]; ctx.fillRect(platform.x, platform.y, platform.w, 6);
      ctx.fillStyle = "rgba(2, 6, 23, 0.35)";
      for (let x = platform.x + 12; x < platform.x + platform.w; x += 48) ctx.fillRect(x, platform.y + 14, 24, 5);
    }
    ctx.fillStyle = "#ef4444";
    for (const hazard of level.hazards) for (let x = hazard.x; x < hazard.x + hazard.w; x += 14) { ctx.beginPath(); ctx.moveTo(x, hazard.y + hazard.h); ctx.lineTo(x + 7, hazard.y); ctx.lineTo(x + 14, hazard.y + hazard.h); ctx.closePath(); ctx.fill(); }
    if (game.bossActive && !game.bossDefeated) {
      const arena = currentBossArena();
      drawGate(arena.x + 8); drawGate(arena.right - 24);
    }
  }
  function drawCheckpoints() {
    for (const checkpoint of level.checkpoints) {
      const active = checkpoint.x <= game.safePoint.x;
      const platform = platformUnderPoint(checkpoint);
      const baseY = platform ? platform.y : checkpoint.y + CONFIG.player.standHeight;
      const poleX = checkpoint.x + 14;
      ctx.fillStyle = active ? "#5eead4" : "rgba(203, 213, 225, 0.45)";
      ctx.fillRect(poleX, baseY - 50, 4, 50);
      ctx.fillRect(poleX + 4, baseY - 48, 22, 12);
      ctx.fillStyle = active ? "#fde68a" : "rgba(15, 23, 42, 0.75)";
      ctx.fillRect(poleX + 8, baseY - 45, 10, 4);
    }
  }
  function drawGate(x) {
    ctx.fillStyle = "rgba(248, 113, 113, 0.55)"; ctx.fillRect(x, 120, 12, CONFIG.groundY - 120);
    ctx.fillStyle = "#fecaca"; for (let y = 130; y < CONFIG.groundY; y += 32) ctx.fillRect(x - 4, y, 20, 8);
  }

  function drawPlayer() {
    const p = game.player;
    if (p.damageInvuln > 0 && Math.floor(game.time * 18) % 2 === 0) return;
    const flash = p.hitFlash > 0 ? "#ffffff" : "#22d3ee", dir = p.facing, bodyY = p.y + (p.crouching ? 8 : 10), legStep = Math.sin(p.walkClock) * 5;
    ctx.fillStyle = "#0891b2"; ctx.fillRect(p.x + 5, p.y + 2, 20, 14);
    ctx.fillStyle = "#0f172a"; ctx.fillRect(p.x + (dir > 0 ? 17 : 5), p.y + 6, 8, 5);
    ctx.fillStyle = flash; ctx.fillRect(p.x + 7, bodyY, 18, p.crouching ? 15 : 22);
    ctx.fillStyle = "#0e7490"; ctx.fillRect(p.x + (dir > 0 ? 2 : 23), bodyY + 4, 6, 16);
    ctx.fillStyle = "#bae6fd"; ctx.fillRect(p.x + 11, bodyY + 3, 7, 8);
    const gunX = dir > 0 ? p.x + 22 : p.x - 13, gunY = p.y + (p.crouching ? 18 : 24);
    ctx.fillStyle = "#cbd5e1"; ctx.fillRect(gunX, gunY, 20, 6);
    ctx.fillStyle = "#334155"; ctx.fillRect(dir > 0 ? gunX + 15 : gunX, gunY + 1, 8, 4);
    ctx.fillStyle = "#164e63"; const legY = p.y + p.h - 10;
    if (p.crouching) ctx.fillRect(p.x + 8, legY, 16, 8);
    else { ctx.fillRect(p.x + 8, legY, 7, 10 + legStep * 0.2); ctx.fillRect(p.x + 18, legY, 7, 10 - legStep * 0.2); }
    if (p.muzzleFlash > 0) { ctx.fillStyle = "#fde047"; ctx.fillRect(dir > 0 ? gunX + 22 : gunX - 8, gunY - 2, 8, 10); }
  }
  function enemyColor(enemy, normal) { return enemy.hitFlash > 0 ? "#ffffff" : normal; }
  function drawEnemies() {
    for (const e of game.enemies) {
      if (e.dead || e.x + e.w < game.camera.x - 80 || e.x > game.camera.x + CONFIG.width + 80) continue;
      if (e.type === "patrol") drawPatrol(e); if (e.type === "turret") drawTurret(e); if (e.type === "flyer") drawFlyer(e);
    }
    if (game.bossActive && game.boss && !game.boss.dead) drawBoss(game.boss);
  }
  function drawPatrol(e) {
    ctx.fillStyle = enemyColor(e, "#f97316"); ctx.fillRect(e.x + 5, e.y + 6, 20, 26);
    ctx.fillStyle = "#7f1d1d"; ctx.fillRect(e.x + 7, e.y, 16, 12);
    ctx.fillStyle = "#fed7aa"; ctx.fillRect(e.x + (e.facing > 0 ? 18 : 5), e.y + 4, 6, 4);
    ctx.fillStyle = "#991b1b"; ctx.fillRect(e.x + 4, e.y + 32, 7, 10); ctx.fillRect(e.x + 19, e.y + 32, 7, 10);
    ctx.fillStyle = "#1f2937"; ctx.fillRect(e.facing > 0 ? e.x + 23 : e.x - 12, e.y + 18, 18, 5);
  }
  function drawTurret(e) {
    ctx.fillStyle = "#7f1d1d"; ctx.fillRect(e.x + 5, e.y + 22, 28, 16);
    ctx.fillStyle = enemyColor(e, "#ef4444"); ctx.fillRect(e.x + 8, e.y + 8, 22, 18);
    ctx.fillStyle = "#fed7aa"; ctx.fillRect(e.facing > 0 ? e.x + 27 : e.x - 11, e.y + 14, 22, 7);
    ctx.fillStyle = "#450a0a"; ctx.fillRect(e.x + 13, e.y + 13, 12, 5);
  }
  function drawFlyer(e) {
    ctx.fillStyle = enemyColor(e, "#fb7185"); ctx.fillRect(e.x + 7, e.y + 8, 20, 15);
    ctx.fillStyle = "#7e22ce"; ctx.fillRect(e.x + 1, e.y + 12, 8, 6); ctx.fillRect(e.x + 25, e.y + 12, 8, 6);
    ctx.fillStyle = "#fef3c7"; ctx.fillRect(e.x + (e.facing > 0 ? 21 : 8), e.y + 11, 5, 4);
  }
  function drawBoss(b) {
    const c = enemyColor(b, "#dc2626");
    ctx.fillStyle = "#450a0a"; ctx.fillRect(b.x + 6, b.y + 16, b.w - 12, b.h - 10);
    ctx.fillStyle = c; ctx.fillRect(b.x + 16, b.y + 4, b.w - 32, 34); ctx.fillRect(b.x + 10, b.y + 38, b.w - 20, 50);
    ctx.fillStyle = "#f97316"; ctx.fillRect(b.x + 2, b.y + 42, 14, 34); ctx.fillRect(b.x + b.w - 16, b.y + 42, 14, 34);
    ctx.fillStyle = "#fecaca"; ctx.fillRect(b.x + (b.facing > 0 ? b.w - 28 : 18), b.y + 18, 12, 7);
    ctx.fillStyle = "#1f2937"; ctx.fillRect(b.facing > 0 ? b.x + b.w - 6 : b.x - 28, b.y + 56, 34, 10);
    ctx.fillStyle = "#991b1b"; ctx.fillRect(b.x + 18, b.y + 88, 16, 16); ctx.fillRect(b.x + b.w - 34, b.y + 88, 16, 16);
    if (b.shieldHp > 0) {
      ctx.strokeStyle = "rgba(96, 165, 250, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      ctx.fillStyle = "rgba(96, 165, 250, 0.32)";
      ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, 5);
    }
  }

  function drawItems() {
    for (const item of game.items) {
      if (item.collected) continue;
      const y = item.y + Math.sin(item.bob) * 5;
      ctx.save(); ctx.translate(item.x + 12, y + 12); ctx.rotate(item.bob * 0.4);
      ctx.fillStyle = item.type === "health" ? "#22c55e" : item.type === "rapid" ? "#facc15" : "#38bdf8";
      ctx.fillRect(-10, -10, 20, 20); ctx.fillStyle = "#020617";
      if (item.type === "health") { ctx.fillRect(-2, -7, 4, 14); ctx.fillRect(-7, -2, 14, 4); }
      else if (item.type === "rapid") { ctx.fillRect(-6, -4, 12, 3); ctx.fillRect(-6, 2, 12, 3); }
      else { ctx.fillRect(-7, -1, 14, 3); ctx.fillRect(-5, -6, 10, 3); ctx.fillRect(-5, 5, 10, 3); }
      ctx.restore();
    }
  }
  function drawBullets(bullets, isPlayer) {
    for (const b of bullets) {
      if (isPlayer) { ctx.fillStyle = "#fef08a"; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.fillStyle = "#67e8f9"; ctx.fillRect(b.x - Math.sign(b.vx) * 4, b.y + 1, 5, 3); }
      else { ctx.fillStyle = b.color || "#fb7185"; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(b.x + 3, b.y + 3, 4, 4); }
    }
  }
  function drawParticles() {
    for (const p of game.particles) { ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); ctx.globalAlpha = 1; }
  }
  function drawFloatingText() {
    ctx.font = "16px 'Courier New', monospace"; ctx.textAlign = "left";
    for (const text of game.texts) { ctx.globalAlpha = clamp(text.life / text.maxLife, 0, 1); ctx.fillStyle = "#020617"; ctx.fillText(text.text, text.x + 2, text.y + 2); ctx.fillStyle = text.color; ctx.fillText(text.text, text.x, text.y); ctx.globalAlpha = 1; }
  }
  function drawWarning() {
    ctx.globalAlpha = clamp(0.55 + Math.sin(game.time * 18) * 0.25, 0.2, 1);
    ctx.fillStyle = "#f43f5e"; ctx.font = "54px 'Courier New', monospace"; ctx.textAlign = "center"; ctx.fillText("WARNING", CONFIG.width / 2, 142); ctx.globalAlpha = 1;
  }
  function drawBossIntro() {
    const progress = 1 - clamp(game.bossIntroTimer / 2.2, 0, 1);
    ctx.fillStyle = "rgba(2, 6, 23, 0.55)";
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    ctx.globalAlpha = clamp(0.6 + Math.sin(game.time * 10) * 0.25, 0.25, 1);
    ctx.fillStyle = "#f43f5e";
    ctx.fillRect(0, 96, CONFIG.width, 10);
    ctx.fillRect(0, 428, CONFIG.width, 10);
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fda4af";
    ctx.font = "30px 'Courier New', monospace";
    ctx.fillText("BOSS APPROACH", CONFIG.width / 2, 210);
    ctx.fillStyle = "#fde68a";
    ctx.font = "42px 'Courier New', monospace";
    ctx.fillText(game.bossIntroName || level.bossName, CONFIG.width / 2, 274);
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillText("TARGET LOCKING...", CONFIG.width / 2, 312);
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(CONFIG.width * 0.2, 338, CONFIG.width * 0.6 * progress, 8);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.8)";
    ctx.strokeRect(CONFIG.width * 0.2, 338, CONFIG.width * 0.6, 8);
  }
  function drawDebugBoxes() {
    ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 1; strokeRect(game.player); for (const enemy of livingTargets()) strokeRect(enemy);
    ctx.strokeStyle = "#22c55e"; for (const platform of level.platforms) strokeRect(platform);
    ctx.strokeStyle = "#ef4444"; for (const hazard of level.hazards) strokeRect(hazard);
  }
  function strokeRect(rect) { ctx.strokeRect(rect.x, rect.y, rect.w, rect.h); }
  function updateFps(dt) {
    game.fpsTimer += dt; game.fpsFrames += 1;
    if (game.fpsTimer >= 0.5) { game.fps = Math.round(game.fpsFrames / game.fpsTimer); game.fpsTimer = 0; game.fpsFrames = 0; }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0);
    last = now; updateFps(dt); updateState(dt); draw(); updateHud(); input.endFrame(); requestAnimationFrame(loop);
  }
  initPlayerId();
  resetGame();
  requestAnimationFrame(loop);
})();
