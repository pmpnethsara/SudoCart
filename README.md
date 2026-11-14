# SudoRank

Campus tech event & competition platform for Sri Lankan universities.

## Setup
1. Create the database: run `database.sql` in MySQL/MariaDB.
   - Already have the old database? Just run: `ALTER TABLE events ADD COLUMN image_url VARCHAR(255) NULL;`
2. Copy `.env.example` to `.env` and fill in your MySQL password and a long random `JWT_SECRET`.
3. Install and start:
   ```bash
   npm install
   npm start
   ```
4. Open http://localhost:3000/index_2.html

## Structure
- `server.js` – Express API (auth, events, ads, admin, photo uploads)
- `public/` – the only folder served to browsers (HTML, CSS, JS)
- `uploads/` – event photos submitted by organizers (created automatically)

## Event photos
Organizers can attach a JPG/PNG/WEBP (max 3 MB) in the "Post a university event" form.
It shows on the event card after an admin approves the event. Admins can see the photo in the admin panel.

## Merch store
Organizers can submit competition merchandise (T-shirts, bangles, sticker packs, other) from the
"Submit a product" tab in the publish section: name, category, price (LKR), seller, order link
(Google Form or website), photo and description. Admins review, edit, approve, unpublish or delete
products in the Admin Dashboard. Approved products appear in the Store section with an "Order now" button
that opens the seller's own link. SudoRank does not process payments.

Upgrading from the first version? Re-run `database.sql` (it only creates the missing `products` table).
