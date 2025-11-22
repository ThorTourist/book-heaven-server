// index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import fs from "fs";
import path from "path";
import admin from "firebase-admin";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // IMPORTANT for base64 images!
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// --- Firebase Admin Setup ---
const serviceAccountPath = path.join(
  process.cwd(),
  "book-heaven-firebase-adminsdk.json"
);

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const idToken = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // debug print
    console.log("Decoded Token:", decodedToken);

    req.user = decodedToken;
    next();
  } catch (err) {
    console.error("Token error:", err);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

// --- MongoDB Setup ---
const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("bookHeaven"); // explicit database
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

await connectDB();

// --- ROUTES ---

// Test route
app.get("/", (req, res) => {
  res.send("Express server is running!");
});

// Add new book (protected)
app.post("/add-book", verifyToken, async (req, res) => {
  try {
    // The frontend does NOT send userEmail → we fetch from decoded token
    const book = {
      ...req.body,
      userEmail: req.user.email,
      userName: req.user.name || req.user.email,
      createdAt: new Date(),
    };

    const result = await db.collection("books").insertOne(book);

    res.json({
      message: "Book added successfully",
      bookId: result.insertedId,
    });
  } catch (err) {
    console.error("Insert error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get all books (public)
app.get("/all-books", async (req, res) => {
  try {
    const books = await db.collection("books").find().toArray();
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get book details by Id (protected)
app.get("/book-details/:id", verifyToken, async (req, res) => {
  try {
    const book = await db
      .collection("books")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!book) return res.status(404).json({ message: "Book not found" });

    res.json(book);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get books added by logged-in user
app.get("/myBooks", verifyToken, async (req, res) => {
  try {
    const books = await db
      .collection("books")
      .find({ userEmail: req.user.email })
      .toArray();

    res.json(books);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a book
app.put("/update-book/:id", verifyToken, async (req, res) => {
  try {
    const filter = {
      _id: new ObjectId(req.params.id),
      userEmail: req.user.email, // only allow owner
    };

    const update = { $set: req.body };

    const result = await db.collection("books").updateOne(filter, update);

    if (result.matchedCount === 0)
      return res
        .status(404)
        .json({ message: "Book not found or unauthorized" });

    res.json({ message: "Book updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a book
app.delete("/delete-book/:id", verifyToken, async (req, res) => {
  try {
    const filter = {
      _id: new ObjectId(req.params.id),
      userEmail: req.user.email, // only owner
    };

    const result = await db.collection("books").deleteOne(filter);

    if (result.deletedCount === 0)
      return res
        .status(404)
        .json({ message: "Book not found or unauthorized" });

    res.json({ message: "Book deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
