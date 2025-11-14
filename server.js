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
  { text: "📉 Panic selling! Market dropping fast!", impact: -12 },
  { text: "📈 Central bank cuts interest rates sharply, strong market rebound!", impact: +15 },
  { text: "⚠️ Geopolitical tensions rising, investors worried!", impact: -8 },
  { text: "🔥 Tech giant beats earnings expectations, stock surges!", impact: +14 },
  { text: "🏦 Liquidity concerns at major bank shake market confidence.", impact: -10 },
  { text: "🌱 Stable macroeconomic data keeps markets calm.", impact: 0 },
  { text: "🤖 Breakthrough in AI technology boosts tech sector sentiment!", impact: +9 },
  { text: "🧨 Regulatory investigation into large corporation shocks market.", impact: -11 },
  { text: "🌋 Unexpected inflation spike reported, economists alarmed!", impact: -7 },
  { text: "📊 GDP growth exceeds expectations, market optimism rises.", impact: +8 },
  { text: "💼 Massive layoffs announced across multiple industries.", impact: -6 },
  { text: "🚀 Successful launch of new satellite technology excites investors.", impact: +7 },
  { text: "💣 Military conflict in key region disrupts global markets.", impact: -13 },
  { text: "🛢️ Oil prices surge due to supply shortage concerns.", impact: +6 },
  { text: "🛢️ Oil prices crash unexpectedly as demand weakens.", impact: -9 },
  { text: "🌐 Strong US dollar pressures global markets.", impact: -5 },
  { text: "💵 Government announces new stimulus package.", impact: +10 },
  { text: "💥 Major cryptocurrency crashes, dragging risk assets down.", impact: -6 },
  { text: "🏗️ Housing market shows signs of strong recovery.", impact: +5 },
  { text: "🧬 Positive breakthrough in medical research boosts biotech stocks.", impact: +11 },

  { text: "📉 A major hedge fund collapses due to excessive leverage, markets shaken.", impact: -14 },
  { text: "📈 Strong job market report boosts investor confidence.", impact: +7 },
  { text: "⚡ Cyberattack on a major tech company disrupts global operations.", impact: -9 },
  { text: "💡 Breakthrough in renewable energy lowers long-term costs.", impact: +6 },
  { text: "📉 Manufacturing sector shows sharp contraction this month.", impact: -8 },
  { text: "🌍 International trade agreement signed, markets celebrate.", impact: +9 },
  { text: "🚧 Supply chain disruptions worsen due to port closures.", impact: -7 },
  { text: "💰 Major investment firm announces new billion-dollar innovation fund.", impact: +8 },
  { text: "🎭 Market confused as mixed data releases create uncertainty.", impact: 0 },
  { text: "🏦 Unexpected central bank announcement sparks volatility.", impact: -5 },
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

  // host starts a timed decision phase (10s etc.)
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
server.listen(3000, () => {
  console.log("Backend server running at http://localhost:3000");
});
