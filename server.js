// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ---- GAME CONFIG ----
const INITIAL_BALANCE = 1000;   // 每个玩家初始 1000 €
const INITIAL_PRICE   = 100;    // 初始股价 100 €

// ---- GAME STATE ----
let players = {};          // { socketId: { name, balance, choice } }
let hostId = null;

let currentNews = "";
let currentRound = 0;
let currentPrice = INITIAL_PRICE;    // starting price = 100
let hasShownFirstNews = false;       // 第一条新闻不结算，只是示例

// impact = 百分比变化，例如 6 表示 +6%，-10 表示 -10%
const scenarios = [
  { text: "📉 Panic selling! Prices drop quickly!", impact: -12 },
  { text: "📈 Central bank cuts rates sharply! Strong market rebound!", impact: +15 },
  { text: "⚠️ Geopolitical tensions rise, markets get nervous.", impact: -8 },
  { text: "🔥 Big tech beats expectations! Stock surges!", impact: +14 },
  { text: "🏦 A major bank faces problems, causing fear in the market.", impact: -10 },
  { text: "🌱 Stable economic data keeps the market calm.", impact: 0 },
  { text: "🤖 Major AI breakthrough boosts tech stocks!", impact: +9 },
  { text: "🧨 A large company is under investigation, shocking the market.", impact: -11 },
  { text: "🌋 Inflation jumps unexpectedly, everyone is worried.", impact: -7 },
  { text: "📊 GDP growth stronger than expected, investors become optimistic.", impact: +8 },
  { text: "💼 Huge layoffs announced across many industries.", impact: -6 },
  { text: "🚀 Successful satellite launch excites investors.", impact: +7 },
  { text: "💣 Conflict erupts in an important region, global markets fall.", impact: -13 },
  { text: "🛢️ Oil prices surge due to supply concerns.", impact: +6 },
  { text: "🛢️ Weak demand causes oil prices to crash.", impact: -9 },
  { text: "🌐 Strong US dollar puts pressure on global markets.", impact: -5 },
  { text: "💵 Government introduces a new stimulus package.", impact: +10 },
  { text: "💥 Major cryptocurrency crash drags the market down.", impact: -6 },
  { text: "🏗️ Housing market shows strong recovery.", impact: +5 },
  { text: "🧬 Medical breakthrough boosts biotech stocks.", impact: +11 },

  { text: "📉 A large hedge fund collapses, shaking the market.", impact: -14 },
  { text: "📈 Strong job report boosts investor confidence.", impact: +7 },
  { text: "⚡ Cyberattack on a major tech company disrupts operations.", impact: -9 },
  { text: "💡 Renewable energy breakthrough lowers long-term costs.", impact: +6 },
  { text: "📉 Manufacturing data shows a sharp decline.", impact: -8 },
  { text: "🌍 International trade agreement signed, markets celebrate.", impact: +9 },
  { text: "🚧 Port closures make supply chain problems worse.", impact: -7 },
  { text: "💰 Major investment firm launches a billion-dollar innovation fund.", impact: +8 },
  { text: "🎭 Mixed economic data confuses the market.", impact: 0 },

  // 你新加的几条
  { text: "🌐 US–China trade war escalates, markets panic.", impact: -13 },
  { text: "🇺🇸 Trump announces new tariffs, markets drop sharply.", impact: -12 },
  { text: "🏦 The central bank warns it may raise interest rates soon, making markets nervous.", impact: -5 }
];

// ---- SOCKET LOGIC ----
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // host joins
  socket.on("join_as_host", () => {
    hostId = socket.id;
    console.log("Host connected:", hostId);
    socket.emit("host_confirmed");
  });

  // player joins
  socket.on("join_as_player", (playerName) => {
    players[socket.id] = {
      name: playerName,
      balance: INITIAL_BALANCE,  // 这里改成 1000
      choice: "",                // "buy" | "hold" | "sell" | ""
    };
    console.log("Player joined:", playerName);
    socket.emit("player_confirmed");
    io.emit("update_players", players);
  });

  // player chooses Buy / Hold / Sell
  socket.on("player_choice", (choice) => {
    if (!players[socket.id]) return;
    if (!["buy", "hold", "sell"].includes(choice)) return;

    players[socket.id].choice = choice;
    io.emit("update_players", players);
  });

  // host starts a timed decision phase (30s etc.)
  socket.on("start_round", (durationSeconds) => {
    if (socket.id !== hostId) return;

    currentRound += 1;

    // 新一轮开始，玩家可以在倒计时里随时改 choice
    io.emit("round_started", {
      round: currentRound,
      duration: durationSeconds,
    });
  });

  // host clicks "Random news"
  socket.on("random_news", () => {
    if (socket.id !== hostId) return;

    // 随机抽一条新闻
    const scenario =
      scenarios[Math.floor(Math.random() * scenarios.length)];

    const oldPrice = currentPrice;
    const pctImpact = scenario.impact;        // 比如 6 表示 +6%

    // ---- 更新价格：按百分比变化 ----
    const priceFactor = 1 + pctImpact / 100;  // 1.06 / 0.9 之类
    const newPrice = parseFloat((oldPrice * priceFactor).toFixed(2));
    const change = parseFloat((newPrice - oldPrice).toFixed(2));

    currentPrice = Math.max(1, newPrice);
    const pct = parseFloat(((change / oldPrice) * 100).toFixed(1)); // 实际百分比，1 位小数

    // -------------------------
    // 结算上一轮
    // -------------------------
    if (hasShownFirstNews) {
      Object.values(players).forEach((p) => {
        if (!p.choice) return; // 没做选择就不结算

        if (p.choice === "buy") {
          // 买入：资产跟价格同向变化
          const factor = 1 + pctImpact / 100;
          p.balance = parseFloat((p.balance * factor).toFixed(2));
        } else if (p.choice === "sell") {
          // 卖空：价格涨你亏，价格跌你赚
          const factor = 1 - pctImpact / 100;
          p.balance = parseFloat((p.balance * factor).toFixed(2));
        } else if (p.choice === "hold") {
          // hold：最安全，不变
        }
      });

      console.log("Round settled. Price change:", change, "(", pctImpact, "% )");
    } else {
      // 第一条新闻：只作为示例，不结算
      hasShownFirstNews = true;
    }

    currentNews = scenario.text;

    // 广播新闻 + 价格
    io.emit("news_update", {
      text: currentNews,
      price: currentPrice,
      change: change,
      pct: pct,
    });

    // 广播更新后的玩家余额
    io.emit("update_players", players);
  });

  // disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    if (socket.id === hostId) {
      hostId = null;
      io.emit("host_left");
    }

    delete players[socket.id];
    io.emit("update_players", players);
  });
});

// ---- START SERVER ----
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
