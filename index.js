import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import bcrypt, { compareSync } from "bcrypt";

const app = express();
const port = 3000;
const saltRounds = 5;

//initialise env
env.config();

//create session
app.use(
  session({
    secret: "devg123",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(bodyParser.urlencoded({ extended: true }));

//public file location
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

//database details
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "books",
  password: "S&K7&7&ds",
  port: "5432",
});

//connect to database
db.connect();

//function to sort reviews
async function sortReviews(user_id, field, order) {
  const validFields = ["id", "date", "title"];
  const validOrders = ["asc", "desc"];

  if (!validFields.includes(field) || !validOrders.includes(order)) {
    throw new Error("Invalid sorting parameters");
  }

  const result = await db.query(
    `SELECT * FROM reviews 
     WHERE user_id = $1
     ORDER BY ${field} ${order.toUpperCase()}`,
    [user_id]
  );

  return result.rows;
}

//function to add review
async function addReview(user_id, title, desc, notes, isbn, date, image) {
  try {
    await db.query(
      `INSERT INTO reviews(user_id, title,description,notes,isbn, date, image)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user_id, title, desc, notes, isbn, date, image]
    );
  } catch (err) {
    console.log(err);
  }
}

//function to edit review
async function editReview(title, description, notes, isbn, image, id) {
  try {
    await db.query(
      `UPDATE reviews
            SET title = $1, description = $2, notes = $3, isbn = $4, image = $5
            WHERE id = $6`,
      [title, description, notes, isbn, image, id]
    );
  } catch (err) {
    console.log("Unable to edit review, " + err);
  }
}

//function to delete review
async function deleteReview(id) {
  try {
    await db.query(`DELETE FROM reviews WHERE id = ${id}`);
  } catch (err) {
    console.log("Unable to delete review, " + err);
  }
}

//function to get all reviews
async function getReviews() {
  try {
    let result = await db.query("SELECT * FROM reviews ORDER BY id DESC");
    return result;
  } catch (err) {
    console.log("Unable to get reviews, " + err);
  }
}

//function to retrun review by id
async function getReview(id) {
  try {
    let result = await db.query(`SELECT * FROM reviews WHERE id = ${id}`);
    console.log(result.rows[0]);
    return result.rows[0];
  } catch (err) {
    console.log(err);
  }
}

//function to return reviews by user_id
async function getUserReviews(user_id) {
  try {
    const result = await db.query("SELECT * FROM reviews WHERE user_id = $1", [
      user_id,
    ]);
    return result.rows;
  } catch (err) {
    console.log("Unable to get user reviews");
  }
}

//function to create user
async function createUser(name, email, password) {
  await db.query(
    "INSERT INTO users(username, email, password) VALUES ($1,$2,$3)",
    [name, email, password]
  );
}

//function to delete user
async function deleteUser(id) {
  try {
    await db.query(`DELETE FROM users WHERE id = ${id}`);
  } catch (err) {
    console.log("Unable to delete user, " + err);
  }
}

//function to change password
async function changePassword(email, password) {
  try {
    const hash = await bcrypt.hash(password, saltRounds);
    const result = await db.query(
      "UPDATE users SET password = $1 WHERE email = $2",
      [hash, email]
    );
    // Handle successful update (optional: log success message)
    return true; // Indicate successful update (optional)
  } catch (err) {
    console.error("Error updating password:", err);
    return false; // Indicate error (optional)
  }
}

//function to get book cover image
async function getImage(isbn) {
  try {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  } catch (err) {
    console.log("Unable to generate image, " + err);
    return null;
  }
}

//load main page
app.get("/", ensureAuthenticated, async (req, res) => {
  const reviews = await getUserReviews(req.user.id);
  res.render("index.ejs", {
    reviews: reviews,
  });
});

//load individual review page
app.get("/review/:id", ensureAuthenticated, async (req, res) => {
  const review = await getReview(req.params.id);

  if (!review || review.user_id !== req.user.id) {
    return res.status(403).send("Access denied");
  }

  res.render("reviews.ejs", {
    review: review,
  });
});

//load login page
app.get("/login", (req, res) => {
  //login('leo@gmail.com', 'leo');
  if (req.isAuthenticated()) {
    res.redirect("/profile");
    console.log(req.user);
  } else {
    res.render("login.ejs");
  }
});

//load register page
app.get("/register", (req, res) => {
  res.render("register.ejs");
});

//add user
app.post("/register", async (req, res) => {
  let name = req.body.name;
  let email = req.body.email;
  let password = req.body.password;
  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (checkResult.rows.length > 0) {
      res.redirect("/login");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          console.log("Hashed password:", hash); // Add this line
          const result = await db.query(
            "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *",
            [name, email, hash]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            console.log("success");
            console.log(req.user);
            res.redirect("/profile");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

//user register
app.post("/logout", async (req, res) => {
  req.logout(function (err) {
    if (err) {
      console.log(err);
    }
    res.redirect("/");
  });
});

//user change password
app.post("/changePassword", async (req, res) => {
  if (req.isAuthenticated()) {
    const pas1 = req.body.password;
    const pas2 = req.body.password2;
    const email = req.user.email;
    console.log(email);
    console.log(pas1 + " " + pas2);
    if (pas1 == pas2) {
      try {
        await changePassword(email, pas1);
        res.render("profile.ejs", {
          user: req.user,
          error: "Password changed succesfully",
        });
      } catch (err) {
        console.log("Unable to change password");
        res.render("profile.ejs", {
          user: req.user,
          error: "Unable to change password",
        });
      }
    } else {
      console.log("Passwords do not match");
      res.render("profile.ejs", {
        user: req.user,
        error: "Password not changed. Passwords do not match",
      });
    }
  } else {
    res.redirect("/login");
  }
});

//delete user account
app.post("/deleteAccount", async (req, res) => {
  await deleteUser(req.user.id);
  req.logout(function (err) {
    if (err) {
      console.log(err);
    }
  });
  res.redirect("/");
});

//add review
app.post("/addReview", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      let notes;
      if (req.body.notes) {
        notes = req.body.notes;
      } else {
        notes = "No notes";
      }
      //id placeholder
      let id = req.user.id;
      let title = req.body.title;
      let desc = req.body.description;
      let isbn = req.body.isbn;
      let date = new Date(Date.now()).toDateString();
      let image = await getImage(isbn);
      await addReview(id, title, desc, notes, isbn, date, image);
      res.redirect("/");
    } catch (err) {
      console.log("Unable to add review: " + err);
    }
  } else {
    res.redirect("/login");
  }
});

//order reviews
app.post("/sort", ensureAuthenticated, async (req, res) => {
  const { field, order } = req.body;

  try {
    const reviews = await sortReviews(req.user.id, field, order);
    res.render("index.ejs", {
      reviews: reviews,
    });
  } catch (err) {
    console.log(err);
    res.redirect("/");
  }
});

//delete specific post
app.post("/delete/:id", ensureAuthenticated, async (req, res) => {
  const review = await getReview(req.params.id);

  if (review.user_id !== req.user.id) {
    return res.status(403).send("Unauthorized");
  }

  await deleteReview(req.params.id);
  res.redirect("/");
});

//edit specific post
app.post("/edit/:id", ensureAuthenticated, async (req, res) => {
  const review = await getReview(req.params.id);

  if (!review || review.user_id !== req.user.id) {
    return res.status(403).send("Unauthorized");
  }

  const { title, description, notes, isbn } = req.body;
  const image = await getImage(isbn);

  await editReview(title, description, notes, isbn, image, req.params.id);
  res.redirect(`/review/${req.params.id}`);
});

// Passport Local Strategy for authentication
passport.use(
  new Strategy(
    {
      usernameField: "email", // Set username field to 'email'
      passwordField: "password",
    },
    async (email, password, cb) => {
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [
          email,
        ]);

        if (result.rows.length > 0) {
          const user = result.rows[0];
          console.log("User found:", user);
          console.log("Provided password:", password);
          console.log("Stored hash:", user.password);
          bcrypt.compare(password, user.password, (err, valid) => {
            if (err) {
              console.error("Error comparing passwords:", err);
              return cb(err);
            } else {
              console.log("Password comparison result:", valid);
              if (valid) {
                return cb(null, user);
              } else {
                console.log("Invalid password");
                return cb(null, false);
              }
            }
          });
        } else {
          console.log("User not found");
          return cb(null, false); // User not found
        }
      } catch (err) {
        console.error("Error during authentication:", err);
        return cb(err);
      }
    }
  )
);

// Serialize and deserialize user
passport.serializeUser((user, cb) => {
  cb(null, user.id);
});

passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query(
      "SELECT id, username, email FROM users WHERE id = $1",
      [id]
    );
    cb(null, result.rows[0]);
  } catch (err) {
    cb(err);
  }
});

// User login route
app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/profile",
    failureRedirect: "/login",
  }),
  (req, res) => {
    console.log("Login request body:", req.body);
    console.log("User after authentication:", req.user);
  }
);

// Load profile page
app.get("/profile", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      console.log("User in profile route:", req.user);
      const reviews = await getUserReviews(req.user.id);
      res.render("profile.ejs", {
        user: req.user,
        reviews: reviews,
      });
    } catch (err) {
      console.log(err);
    }
  } else {
    console.log("User not authenticated, redirecting to login");
    res.redirect("/login");
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
