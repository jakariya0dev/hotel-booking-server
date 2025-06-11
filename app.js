const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const PORT = process.env.PORT || 5000;
const ObjectId = require("mongodb").ObjectId;

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

async function run() {
  try {
    await client.connect();
    await client.db(process.env.DB_NAME).command({ ping: 1 });
    console.log("Pinged to your MongoDB!");

    const roomCollections = client.db(process.env.DB_NAME).collection("rooms");
    const reviewCollections = client.db(process.env.DB_NAME).collection("reviews");
    const bookingCollections = client
      .db(process.env.DB_NAME)
      .collection("bookings");

    // All Rooms Route
    app.get("/api/rooms", async (req, res) => {
      const rooms = await roomCollections.find().toArray();
      res.json(rooms);
    });

    // Room Details Route
    app.get("/api/room/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const room = await roomCollections.findOne(query);
      res.json(room);
    });

    // Book Room Route
    app.post("/api/book-room", async (req, res) => {
      const data = req.body;

      try {
        const result = await bookingCollections.insertOne(data);

        res.json({
          success: true,
          message: "Room Booked Successfully",
          bookingId: result.insertedId,
          data,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: "Failed to book the room",
          error: err.message,
        });
      }
    });

    // My Bookings Route
    app.get("/api/bookings/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const bookings = await bookingCollections.find(query).toArray();
      res.json(bookings);
    });

    // Delete Booking Route
    app.delete("/api/bookings/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await bookingCollections.deleteOne(query);

        if (result.deletedCount === 1) {
          res.status(200).json({
            success: true,
            message: "Booking deleted successfully",
          });
        } else {
          res.status(404).json({
            success: false,
            message: "Booking not found",
          });
        }
      } catch (err) {
        res.status(500).json({
          success: false,
          message: "Failed to cancel the booking",
          error: err.message,
        });
      }
    });

    // add review
    app.post("/api/review", async (req, res) => {
      const review = req.body;
      try {
        const result = await reviewCollections
          .insertOne(review);
        res.status(201).json({
          success: true,
          message: "Review added successfully",
          reviewId: result.insertedId,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: "Failed to add review",
          error: err.message,
        });
      }
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

// app.post("/api/rooms", async (req, res) => {
//   const newRoom = req.body;
//   const result = await roomsCollection.insertOne(newRoom);
//   res.status(201).json(result);
// });

// app.get("/", (req, res) => res.send("Hotel Booking Server is Running"));

app.listen(PORT, () => {
  console.log(`Server running at ${PORT}`);
});
