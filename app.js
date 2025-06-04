const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db, roomsCollection;

async function run() {
  try {
    await client.connect();
    await client.db(process.env.DB_NAME).command({ ping: 1 });
    console.log("Pinged to your MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

// // Rooms Routes
// app.get("/api/rooms", async (req, res) => {
//   const rooms = await roomsCollection.find().toArray();
//   res.json(rooms);
// });

// app.post("/api/rooms", async (req, res) => {
//   const newRoom = req.body;
//   const result = await roomsCollection.insertOne(newRoom);
//   res.status(201).json(result);
// });

// app.get("/", (req, res) => res.send("Hotel Booking Server is Running"));

app.listen(PORT, () => {
  console.log(`Server running at ${PORT}`);
});
