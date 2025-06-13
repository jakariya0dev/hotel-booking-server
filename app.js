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
    const reviewCollections = client
      .db(process.env.DB_NAME)
      .collection("reviews");
    const bookingCollections = client
      .db(process.env.DB_NAME)
      .collection("bookings");

    // All Rooms Route
    app.get("/api/rooms", async (req, res) => {
      const rooms = await roomCollections.find().toArray();
      res.json(rooms);
    });

// six most rated rooms
app.get("/api/rooms/top-rated", async (req, res) => {
  const rooms = await roomCollections
    .aggregate([
      {
        $addFields: {
          stringId: { $toString: "$_id" },
        },
      },
      {
        $lookup: {
          from: "reviews",
          localField: "stringId",
          foreignField: "roomId",
          as: "reviews",
        },
      },
      {
        $addFields: {
          averageRating: { $avg: "$reviews.rating" },
        },
      },
      { $sort: { averageRating: -1 } },
      { $limit: 6 },
    ])
    .toArray();

  res.json(rooms);
});


    // Room Details Route
    app.get("/api/room/:id", async (req, res) => {
      const id = req.params.id;
      const result = await roomCollections
        .aggregate([
          { $match: { _id: new ObjectId(id) } },
          {
            $addFields: {
              roomId: { $toString: "$_id" },
            },
          },
          {
            $lookup: {
              from: "reviews",
              localField: "roomId",
              foreignField: "roomId",
              as: "reviews",
            },
          },
          {
            $lookup: {
              from: "bookings",
              localField: "roomId",
              foreignField: "roomId",
              as: "bookings",
            },
          },
        ])
        .toArray();

      res.json(result[0] || {});
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
      try {
        const bookings = await bookingCollections
          .aggregate([
            { $match: { userEmail: req.params.email } },
            {
              $addFields: {
                roomObjectId: { $toObjectId: "$roomId" },
              },
            },
            {
              $lookup: {
                from: "rooms",
                localField: "roomObjectId",
                foreignField: "_id",
                as: "roomDetails",
              },
            },
          ])
          .toArray();

        res.json(bookings);
      } catch (err) {
        console.error("Error in /api/bookings/:email", err);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Update Booking Route
    app.patch("/api/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID",
        });
      }

      res.status(200).json({
        success: true,
        message: "Booking update request received",
        data: updatedData,
      });

      try {
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: updatedData,
        };

        const result = await bookingCollections.updateOne(query, updateDoc);

        if (result.modifiedCount === 1) {
          res.status(200).json({
            success: true,
            message: "Booking updated successfully",
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
          message: "Failed to update the booking",
          error: err.message,
        });
      }
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
        const result = await reviewCollections.insertOne(review);
        if (result.acknowledged) {
          await bookingCollections.updateOne(
            { _id: new ObjectId(review.bookingId) },
            { $set: { reviewed: true } }
          );
        }
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

    // get all reviews of a room
    app.get("/api/reviews/:id", async (req, res) => {
      try {
        const query = { roomId: new ObjectId(req.params.id) };
        const reviews = await reviewCollections.find(query).toArray();
        res.status(200).json(reviews);
      } catch (err) {
        console.error("Error fetching reviews:", err);
        res.status(500).json({ message: "Server error" });
      }
    });

    // get all reviews
    app.get("/api/reviews", async (req, res) => {
      try {
        const reviews = await reviewCollections
          .find()
          .sort({ date: -1 })
          .toArray();
        res.status(200).json({ success: true, reviews: reviews });
      } catch (err) {
        console.error("Error fetching reviews:", err);
        res.status(500).json({ success: false, message: "Server error" });
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
