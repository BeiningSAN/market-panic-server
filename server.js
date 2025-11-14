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

// ---- GAME STATE ----
let players = {};          // { socketId: { name, balance, choice } }
let hostId = null;

let currentNews = "";
let currentRound = 0;
let currentPrice = 100;    // starting price
let hasShownFirstNews = false; // first news has no payoff

// 30+ news scenarios, each with a price impact (ΔP)
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

  // NEW ITEMS YOU REQUESTED
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
      balance: 100,
      choice: "",     // last decision: "buy" | "hold" | "sell" | ""
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

    // when a new round starts, we do NOT reset choices here,
    // because choices are used for the NEXT news.
    // Players can change their choice any time during the countdown.

    io.emit("round_started", {
      round: currentRound,
      duration: durationSeconds,
    });
  });

  // host clicks "Random news"
  socket.on("random_news", () => {
    if (socket.id !== hostId) return;

    // pick a random scenario
    const scenario =
      scenarios[Math.floor(Math.random() * scenarios.length)];

    const oldPrice = currentPrice;
    currentPrice = Math.max(1, currentPrice + scenario.impact);
    const change = currentPrice - oldPrice;
    const pct = (change / oldPrice) * 100;

    // -------------------------
    // SETTLE PREVIOUS ROUND
    // -------------------------
    if (hasShownFirstNews) {
      // we already had a previous news, so now we use THIS price change
      // to reward/punish previous choices
      Object.values(players).forEach((p) => {
        if (!p.choice) return; // no decision -> no gain/loss

        if (p.choice === "buy") {
          // price up => win, price down => lose (change may be negative)
          p.balance += change;
        } else if (p.choice === "sell") {
          // opposite of buy
          p.balance -= change;
        } else if (p.choice === "hold") {
          // safest: no change
          // if you want small effect: p.balance += change * 0.2;
        }
      });

      console.log("Round settled with change:", change);
    } else {
      // first news: only used to give information,
      // no payoff because there was no previous decision
      hasShownFirstNews = true;
    }

    currentNews = scenario.text;

    // broadcast updated news + price
    io.emit("news_update", {
      text: currentNews,
      price: currentPrice,
      change: change,
      pct: pct,
    });

    // broadcast updated balances after settlement
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

