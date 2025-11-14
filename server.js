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
let players = {};         
let hostId = null;

let currentNews = "";
let currentRound = 0;
let currentPrice = INITIAL_PRICE;
let hasShownFirstNews = false;

// ---- RESET FUNCTION ----
function resetGame() {
  players = {};
  currentNews = "";
  currentRound = 0;
  currentPrice = INITIAL_PRICE;
  hasShownFirstNews = false;

  console.log("🔥 Game reset. Price set to:", INITIAL_PRICE);
}

// ---- NEWS LIST (scenarios) ----
const scenarios = [
  { text: "📉 Panic selling! Prices drop quickly!", impact: -10 },
  { text: "📈 Central bank cuts rates sharply! Strong market rebound!", impact: +16 },
  { text: "⚠️ Geopolitical tensions rise, markets get nervous.", impact: -6 },
  { text: "🔥 Big tech beats expectations! Stock surges!", impact: +15 },
  { text: "🏦 A major bank faces problems, causing fear in the market.", impact: -8 },
  { text: "🌱 Stable economic data keeps the market calm.", impact: 0 },
  { text: "🤖 Major AI breakthrough boosts tech stocks!", impact: +9 },
  { text: "🧨 A large company is under investigation, shocking the market.", impact: -9 },
  { text: "🌋 Inflation jumps unexpectedly, everyone is worried.", impact: -5 },
  { text: "📊 GDP growth stronger than expected, investors become optimistic.", impact: +8 },
  { text: "💼 Huge layoffs announced across many industries.", impact: -6 },
  { text: "🚀 Successful satellite launch excites investors.", impact: +7 },
  { text: "💣 Conflict erupts in an important region, global markets fall.", impact: -11 },
  { text: "🛢️ Oil prices surge due to supply concerns.", impact: +7 },
  { text: "🛢️ Weak demand causes oil prices to crash.", impact: -7 },
  { text: "🌐 Strong US dollar puts pressure on global markets.", impact: -3 },
  { text: "💵 Government introduces a new stimulus package.", impact: +11 },
  { text: "💥 Major cryptocurrency crash drags the market down.", impact: -4 },
  { text: "🏗️ Housing market shows strong recovery.", impact: +5 },
  { text: "🧬 Medical breakthrough boosts biotech stocks.", impact: +12 },

  { text: "📉 A large hedge fund collapses, shaking the market.", impact: -13 },
  { text: "📈 Strong job report boosts investor confidence.", impact: +8 },
  { text: "⚡ Cyberattack on a major tech company disrupts operations.", impact: -8 },
  { text: "💡 Renewable energy breakthrough lowers long-term costs.", impact: +7 },
  { text: "📉 Manufacturing data shows a sharp decline.", impact: -7 },
  { text: "🌍 International trade agreement signed, markets celebrate.", impact: +10 },
  { text: "🚧 Port closures make supply chain problems worse.", impact: -8 },
  { text: "💰 Major investment firm launches a billion-dollar innovation fund.", impact: +8 },
  { text: "🎭 Mixed economic data confuses the market.", impact: 0 },

  { text: "🌐 US–China trade war escalates, markets panic.", impact: -15 },
  { text: "🇺🇸 Trump announces new tariffs, markets drop sharply.", impact: -12 },
  { text: "🏦 The central bank warns it may raise interest rates soon, making markets nervous.", impact: -4 },

  { text: "📈 The job market improves as more companies start hiring again.", impact: +6 },
  { text: "🏛️ The government increases funding to support small businesses.", impact: +5 },
  { text: "🌍 Tourism rises this month, helping local communities and businesses.", impact: +5 },
  { text: "🌍 Major breakthrough as both the Russia–Ukraine conflict and the Middle East war come to an end, boosting global markets.", 
  impact: +15 },
];

// ---- SOCKET LOGIC ----
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // HOST joins
  socket.on("join_as_host", () => {
    hostId = socket.id;
    console.log("Host connected:", hostId);

    // ⭐ 新 Host 自动 reset（解决你说的问题）
    resetGame();

    // 同步初始状态给前端
    io.emit("update_players", players);
    io.emit("news_update", {
      text: "",
      price: currentPrice,
      change: 0,
      pct: 0,
    });

    socket.emit("host_confirmed");
  });

  // PLAYER joins
  socket.on("join_as_player", (playerName) => {
    players[socket.id] = {
      name: playerName,
      balance: INITIAL_BALANCE,
      choice: "",
    };

    socket.emit("player_confirmed");
    io.emit("update_players", players);
  });

  // Player chooses B / H / S
  socket.on("player_choice", (choice) => {
    if (!players[socket.id]) return;
    if (!["buy", "hold", "sell"].includes(choice)) return;

    players[socket.id].choice = choice;
    io.emit("update_players", players);
  });

  // Host starts a round
  socket.on("start_round", (durationSeconds) => {
    if (socket.id !== hostId) return;

    currentRound += 1;
    io.emit("round_started", {
      round: currentRound,
      duration: durationSeconds,
    });
  });

  // Host clicks "Random news"
  socket.on("random_news", () => {
    if (socket.id !== hostId) return;

    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

    const oldPrice = currentPrice;
    const pctImpact = scenario.impact;

    // 价格按百分比变化（大波动）
    let newPrice = oldPrice * (1 + pctImpact / 100);
    newPrice = parseFloat(newPrice.toFixed(2));
    const change = parseFloat((newPrice - oldPrice).toFixed(2));

    currentPrice = Math.max(1, newPrice);
    const pct = parseFloat(((change / oldPrice) * 100).toFixed(1));

    // 结算
    if (hasShownFirstNews) {
      Object.values(players).forEach((p) => {
        if (!p.choice) return;

        if (p.choice === "buy") {
          p.balance = parseFloat((p.balance * (1 + pctImpact / 100)).toFixed(2));
        } else if (p.choice === "sell") {
          p.balance = parseFloat((p.balance * (1 - pctImpact / 100)).toFixed(2));
        }
      });
    } else {
      hasShownFirstNews = true;
    }

    currentNews = scenario.text;

    io.emit("news_update", {
      text: currentNews,
      price: currentPrice,
      change: change,
      pct: pct,
    });

    io.emit("update_players", players);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    delete players[socket.id];
    io.emit("update_players", players);

    if (socket.id === hostId) {
      hostId = null;
      io.emit("host_left");
    }
  });
});

// ---- START SERVER ----
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
