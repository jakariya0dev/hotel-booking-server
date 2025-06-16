require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const PORT = process.env.PORT || 5000;
const ObjectId = require("mongodb").ObjectId;

// FIREBASE: admin sdk
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(cors());
app.use(express.json());

// Middleware: to verify firebase token
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Unauthorized access", error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    // console.log("Firebase token verified:", decodedToken);

    next();
  } catch (error) {
    console.error("Error verifying Firebase token:", error);
    return res
      .status(401)
      .json({ message: "Unauthorized access", error: "Invalid token" });
  }
};

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
    // Connect the to the server (optional)
    // await client.connect();
    // await client.db(process.env.DB_NAME).command({ ping: 1 });
    // console.log("Pinged to your MongoDB!");

    // Collections
    const roomCollections = client.db(process.env.DB_NAME).collection("rooms");
    const reviewCollections = client
      .db(process.env.DB_NAME)
      .collection("reviews");
    const bookingCollections = client
      .db(process.env.DB_NAME)
      .collection("bookings");

    // API Routes
    app.get("/", (req, res) => {
      res.send({
        message: "Welcome to the Hotel Booking API",
        version: "1.0.0",
        api: [
          {
            method: "GET",
            path: "/api/rooms",
            description: "Get all rooms",
          },
          {
            method: "GET",
            path: "/api/rooms/top-rated",
            description: "Get top rated rooms",
          },
          {
            method: "GET",
            path: "/api/reviews",
            description: "Get all reviews",
          },
        ],
      });
    });

    // All Rooms
    app.get("/api/rooms", async (req, res) => {
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
        ])
        .toArray();
      res.json(rooms);
    });

    // Get rooms by price range
    app.get("/api/rooms/price-range", async (req, res) => {
      const min = parseInt(req.query.minPrice);
      const max = parseInt(req.query.maxPrice);

      if (!min || !max) {
        return res.status(400).json({
          success: false,
          message: "Please provide both minPrice and maxPrice",
        });
      }

      try {

        const result = await roomCollections
          .aggregate([
            {
              $match: {
                price: { $gte: min, $lte: max },
              },
            },
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
          ])
          .toArray();

        res.status(200).json({
          success: true,
          message: "Rooms fetched successfully",
          rooms: result,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: "Error fetching rooms",
          error: err.message,
        });
      }
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

    // PRIVATE: Book Room Route
    app.post("/api/book-room", verifyFirebaseToken, async (req, res) => {
      const data = req.body;

      // check user email matches with booking userEmail
      if (req.user.email !== data.userEmail) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to book this room",
        });
      }

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

    // PRIVATE: My Bookings Route
    app.get("/api/bookings/:email", verifyFirebaseToken, async (req, res) => {
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

    // PRIVATE: Update Booking Route
    app.put("/api/bookings/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      // check user email matches with booking userEmail
      if (req.user.email !== updatedData.userEmail) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized",
        });
      }

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID",
        });
      }

      try {
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            bookingDate: updatedData.bookingDate,
          },
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

    // PRIVATE: Delete Booking Route
    app.delete("/api/bookings/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const data = req.body;

        // check user email matches with booking userEmail
        if (req.user.email !== data.userEmail) {
          return res.status(403).json({
            success: false,
            message: "You are not authorized",
          });
        }

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

    // PRIVATE: add review
    app.post("/api/review", verifyFirebaseToken, async (req, res) => {
      const review = req.body;

      // check user email matches with booking userEmail
      if (req.user.email !== review.userEmail) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized",
        });
      }

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

app.listen(PORT, () => {
  console.log(`Server running at ${PORT}`);
});
