# Medicine Reminder — Deployment and Usage Guide

## 1. Project overview

Medicine Reminder is a web application for registering an account and keeping a list of medicines with a scheduled time and date range. A signed-in user can view and manage their own medicines and mark a medicine as taken for the current date. The dashboard checks due schedules in the browser and displays a reminder alert.

## 2. Technology stack

- **Runtime and server:** Node.js and Express 5
- **Database and models:** MongoDB with Mongoose 9
- **Authentication and sessions:** `bcrypt` password hashing, `express-session`, and `connect-mongo` session storage
- **Frontend:** HTML, CSS, and browser JavaScript
- **API and tests:** Express routes; Jest and Supertest tests

The pages are served as HTML files by Express. The dashboard uses browser JavaScript to call the medicine routes; there is no frontend framework or server-side template engine in the current implementation.

## 3. Live deployment and access

**Live URL provided for the project:** [https://medicine-reminder-14q4.onrender.com](https://medicine-reminder-14q4.onrender.com)

Open the link, choose **Register** if you do not already have an account, then sign in to reach the dashboard. No demo-account credentials are published in this guide.

The repository contains no Render service manifest, Dockerfile, or Compose file. The source expects `MONGO_URI` and `SESSION_SECRET` to be supplied through the runtime environment; it uses `PORT` when set and otherwise listens on port 3000. The Render service settings and database host are therefore external to this repository and are not described here as verified configuration.

For local use, install the dependencies, configure `MONGO_URI` and `SESSION_SECRET` in the local environment, then run `node server.js` and open `http://localhost:3000`. Do not place real credentials in this document or commit them to the repository.

## 4. User guide

### Register

1. Open the application and select **Register**.
2. Enter a name, email address, and password.
3. Submit the form. The application displays a registration-success message with a link to login.

### Log in

1. Open **Login** and enter the email address and password used at registration.
2. Submit the form. A successful login redirects to the dashboard.

### Use the dashboard

The dashboard contains a medicine form and a list of the signed-in user's medicines.

- **Add:** Enter a medicine name, reminder time, start date, and end date, then select **Add Medicine**. The server validates the fields, including the time format and date order.
- **View:** Added medicines appear under **Your Medicines**, with their time, date range, taken status, and action buttons.
- **Edit:** Select **Edit** on a medicine card. Its values are placed into the form; submit the form to save the update.
- **Delete:** Select **Delete** and confirm the browser prompt.
- **Mark as taken:** Select the taken control on the medicine card. The dashboard refreshes and displays the taken state for the current date.
- **Log out:** Select **Logout**. The server destroys the session and returns to the login page.

The dashboard sends a session CSRF token with its write requests. Medicine names are displayed as text in the browser.

## 5. MongoDB storage and user-specific access

User accounts and medicine records are stored in MongoDB through Mongoose models. Passwords are hashed with bcrypt before they are saved. Sessions are stored in MongoDB using `connect-mongo`.

When a medicine is created, the server assigns its `userId` from the authenticated session; the frontend does not choose the owner. Listing filters by that owner ID. Update, delete, and mark-as-taken operations match both the medicine ID and the authenticated owner ID. A user who does not own a medicine receives a not-found response for those operations. The schema requires an owner ID for newly saved medicine records.

## 6. Browser reminder behavior and limits

The dashboard requests the signed-in user's medicines when it loads and checks them again every 30 seconds. It compares the current browser's local date and time with each medicine's date range and scheduled time. If the scheduled time has arrived and the medicine is not marked taken for that date, it calls the browser's `alert()` function. A page-session set prevents the same medicine from repeatedly alerting during that dashboard session.

This mechanism runs in the dashboard page in the browser. It does not dispatch background, email, or SMS notifications. The page must be open and running; a closed, suspended, or offline browser may not show a reminder when expected. The 30-second polling interval and browser scheduling mean the alert is not guaranteed at the exact scheduled second. The in-memory repeat guard resets when the page is reloaded, and no reminder event history is stored. Reminder accuracy has not been formally evaluated.

The current medicine model has one scheduled time and one taken flag/date per medicine. It does not represent multiple daily doses or a dose-by-dose history.

## 7. Screenshot evidence index

These descriptions are based on the supplied images themselves. Screenshots show captured interface states; they do not independently establish that a backend operation succeeded.

### `dashboard1.jpeg`

Shows the deployed `/dashboard` page with the empty medicine form: name, reminder time, start date, end date, and **Add Medicine** controls.

![Dashboard medicine entry form](<Project_Evidence/dashboard1.jpeg>)

### `dashboard2.jpeg`

Shows the lower dashboard with one **DDR 40** medicine card, its displayed time and date range, a green **Taken** indicator, **Edit** and **Delete** controls, and **Logout**.

![Dashboard medicine card and taken state](<Project_Evidence/dashboard2.jpeg>)

### `login.jpeg`

Shows the login page with an email value entered, the password masked, the **Login** button, and a link to register. The password itself is not visible in the image.

![Medicine Reminder login page](<Project_Evidence/login.jpeg>)

### `mark as taken.jpeg`

Shows two medicine cards, **DDR 40** and **Ridon**, both displaying a green check and **Taken**, along with their displayed schedule details and the edit, delete, and logout controls.

![Two medicine cards displaying taken status](<Project_Evidence/mark%20as%20taken.jpeg>)

### `Register.jpeg`

Shows the registration form with name and email values entered, a masked password field, the **Register** button, and a link to login. It shows the form state, not a registration-success response.

![Medicine Reminder registration page](<Project_Evidence/Register.jpeg>)

### `Web Reminder.jpeg`

Shows a browser alert titled **Medicine Reminder!** stating, “It is time to take Ridon.” The dashboard is visible behind the alert. This is evidence of the in-page browser alert mechanism, not a background notification.

![Browser reminder alert for Ridon](<Project_Evidence/Web%20Reminder.jpeg>)

## 8. Known limitations and verification notes

- Reminders depend on the dashboard page running in a browser; there is no server-side scheduler, email, or SMS dispatch.
- One reminder time and one taken flag/date are modeled per medicine; dose history is not stored.
- No formal reminder-accuracy evaluation is included in the project.
- The repository contains no deployment manifest or Docker setup. Runtime environment values and the deployed database host are not available in the source tree.
- The live URL above was supplied by the project owner. The available web inspection tool could not load it during preparation of this guide, so current availability and live service settings could not be independently verified.
- The screenshots visibly show interface states and a browser alert; they do not by themselves prove database persistence or API outcomes.
