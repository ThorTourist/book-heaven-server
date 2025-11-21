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
app.use(express.json());

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
    req.user = decodedToken;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

// --- MongoDB Setup ---
const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db(); // default DB from URI
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

await connectDB();

// --- Routes ---

// Test route
app.get("/", (req, res) => {
  res.send("Express server is running!");
});

// Add new book (protected)
app.post("/add-book", verifyToken, async (req, res) => {
  try {
    const book = {
      ...req.body,
      userEmail: req.user.email,
      userName: req.user.name || req.user.email,
    };
    const result = await db.collection("books").insertOne(book);
    res.json({ message: "Book added successfully", bookId: result.insertedId });
  } catch (err) {
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

// Get book details by id (protected)
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

// Get books added by logged-in user (protected)
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

// Update a book by id (protected)
app.put("/update-book/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const filter = { _id: new ObjectId(id), userEmail: req.user.email }; // only user's own books
    const result = await db
      .collection("books")
      .updateOne(filter, { $set: updatedData });
    if (result.matchedCount === 0)
      return res
        .status(404)
        .json({ message: "Book not found or unauthorized" });
    res.json({ message: "Book updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a book by id (protected)
app.delete("/delete-book/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const filter = { _id: new ObjectId(id), userEmail: req.user.email }; // only user's own books
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

// --- Start Server ---
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
