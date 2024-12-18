const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
require('dotenv').config();
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const path = require("path");
const fs = require("fs");
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { create } = require('express-handlebars');

// Initialize Firebase Admin SDK
admin.initializeApp();
const app = express();

app.use(express.static(path.join(__dirname, "../public/form")));

// Middleware
app.use(express.json());
app.use(cors());

const hbs = create({
    extname: '.hbs', // Use .hbs file extension
    defaultLayout: false // Disable default layout
});

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'templates'));

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    logger.info(`Authenticating token: ${token}`);

    if (!token) {
        logger.warn('No token provided');
        return res.sendStatus(401);
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            logger.error(`Token verification error: ${err.message}`);
            return res.sendStatus(403); // Invalid token
        }
        logger.info(`Token verified for user: ${user.userId}`);
        req.user = user;
        next();
    });
};

app.post('/createForm', authenticateToken, async (req, res) => {
    const userId = req.user.userId; // Get authenticated user ID
    const createdAt = new Date().toISOString(); // Timestamp for creation

    // Define the new form structure
    const newForm = {
        title: "New Form",
        sections: [
            {
                "header":"Section 1 Header",
            }
        ], // Empty questions array
        responses: [], // Empty responses array
        owner: userId, // Owner of the form
        sharedWith: {}, // Shared users and permissions (initially empty)
        createdAt: createdAt,
        lastUpdated: createdAt, // Initially same as createdAt
    };

    try {
        // Save the form to Firebase Database
        const formRef = await admin.database().ref('forms').push(newForm);
        const formId = formRef.key; // Get unique form ID from Firebase
        await formRef.update({ formId }); // Save form ID within the form data

        // Add form reference to the user's list of forms
        await admin.database().ref(`users/${userId}/forms`).push({ formId, lastUpdated: createdAt });

        res.status(200).json({ message: "Form created successfully", formId });
    } catch (error) {
        logger.error("Error creating form:", error);
        res.status(500).send("Error creating form");
    }
});

app.post('/shareForm', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { formId, targetUserId, permission } = req.body;

    if (!['view', 'edit'].includes(permission)) {
        return res.status(400).send("Invalid permission type. Use 'view' or 'edit'.");
    }

    try {
        const formRef = admin.database().ref(`forms/${formId}`);
        const snapshot = await formRef.once("value");

        if (!snapshot.exists()) {
            return res.status(404).send("Form not found.");
        }

        const formData = snapshot.val();

        if (formData.owner !== userId) {
            return res.status(403).send("Only the owner can share the form.");
        }

        // Update sharedWith to include targetUserId and permission
        await formRef.child("sharedWith").update({
            [targetUserId]: permission
        });

        // Add form reference to the target user's list
        await admin.database().ref(`users/${targetUserId}/sharedForms`).push({ formId, permission });

        res.status(200).json({ message: `Form shared with user ${targetUserId} with ${permission} permission.` });
    } catch (error) {
        logger.error("Error sharing form:", error);
        res.status(500).send("Error sharing form");
    }
});

app.post('/createUser', async (req, res) => {
    const { fullName, email, password } = req.body;

    // Validate the email format before proceeding
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).send('Invalid email format.');
    }

    // Search for an existing user with the provided email
    const usersRef = admin.database().ref('users').orderByChild('email').equalTo(email).limitToFirst(1);
    await usersRef.once('value', async snapshot => {
        if (snapshot.exists()) {
            // User already exists
            return res.status(400).send('A user with this email already exists.');
        } else {
            // No user found, proceed with creating a new user
            const createdAt = new Date().toISOString();
            const role = 'user'; // Default role, can be adjusted based on the application's needs

            try {
                // Hash the password before storing it
                const hash = await bcrypt.hash(password, 10);
                // Create user data including the hashed password
                const userData = { fullName, email, password: hash, createdAt, role, onboarding: false };

                // Add the new user to the database
                const data = await admin.database().ref('users').push(userData);
                // Retrieve and assign the Firebase-generated key as the userId
                const userId = data.key;
                await admin.database().ref('users/' + userId).update({ userId });

                // Also add email to the 'emails' directory
                const emailsRef = admin.database().ref('emails');
                await emailsRef.push(email);

                res.status(200).send('User created successfully and email added to directory');
            } catch (error) {
                logger.error("Error creating user:", error);
                res.status(500).send('Error creating user');
            }
        }
    });
});

app.get('/listForms', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        const userForms = [];
        const userPromises = {};

        // Fetch forms owned by the user
        const ownedFormsSnapshot = await admin.database().ref('forms').orderByChild('owner').equalTo(userId).once('value');
        ownedFormsSnapshot.forEach(formSnapshot => {
            const form = formSnapshot.val();
            form.permission = 'owner';
            userForms.push(form);

            // Fetch user details if not already fetched
            if (!userPromises[form.owner]) {
                userPromises[form.owner] = admin.database().ref(`users/${form.owner}`).once('value');
            }
        });

        // Fetch forms shared with the user
        const sharedFormsSnapshot = await admin.database().ref('forms').orderByChild(`sharedWith/${userId}`).startAt('').once('value');
        sharedFormsSnapshot.forEach(formSnapshot => {
            const form = formSnapshot.val();
            form.permission = form.sharedWith[userId];
            userForms.push(form);

            // Fetch user details if not already fetched
            if (!userPromises[form.owner]) {
                userPromises[form.owner] = admin.database().ref(`users/${form.owner}`).once('value');
            }
        });

        // Wait for all user fetches to resolve
        const userResults = await Promise.all(Object.values(userPromises));
        const userMap = {};
        Object.keys(userPromises).forEach((ownerId, index) => {
            const userSnapshot = userResults[index].val();
            userMap[ownerId] = {
                fullName: userSnapshot?.fullName || 'Unknown User',
                email: userSnapshot?.email || 'No Email Available'
            };
        });

        // Add owner full name and email to each form
        userForms.forEach(form => {
            form.ownerFullName = userMap[form.owner]?.fullName;
            form.ownerEmail = userMap[form.owner]?.email;
        });

        // Sort forms by lastUpdated in descending order
        userForms.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));

        res.status(200).json(userForms);
    } catch (error) {
        logger.error("Error listing forms:", error);
        res.status(500).send("Error retrieving forms");
    }
});

app.post('/deleteForms', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { formIds } = req.body;

    if (!Array.isArray(formIds)) {
        return res.status(400).send("Invalid request: formIds should be an array.");
    }

    const deletedForms = [];
    const permissionsRemoved = [];
    const notDeletedForms = [];

    try {
        const deletionPromises = formIds.map(async (formId) => {
            const formRef = admin.database().ref(`forms/${formId}`);
            const snapshot = await formRef.once('value');

            if (!snapshot.exists()) {
                notDeletedForms.push({ formId, reason: "Form not found" });
                return;
            }

            const formData = snapshot.val();

            if (formData.owner === userId) {
                // User is the owner: delete the form
                await formRef.remove();
                deletedForms.push(formId);

                // Remove the form reference from the owner's list of forms
                const userFormsRef = admin.database().ref(`users/${userId}/forms`);
                const userFormsSnapshot = await userFormsRef.once('value');
                if (userFormsSnapshot.exists()) {
                    const userForms = userFormsSnapshot.val();
                    const formKey = Object.keys(userForms).find(key => userForms[key].formId === formId);
                    if (formKey) {
                        await userFormsRef.child(formKey).remove();
                    }
                }
            } else if (formData.sharedWith && formData.sharedWith[userId] === 'edit') {
                // User has editing permissions: remove the permissions
                await formRef.child(`sharedWith/${userId}`).remove();
                permissionsRemoved.push(formId);

                // Remove the form reference from the user's shared forms
                const userSharedFormsRef = admin.database().ref(`users/${userId}/sharedForms`);
                const userSharedFormsSnapshot = await userSharedFormsRef.once('value');
                if (userSharedFormsSnapshot.exists()) {
                    const sharedForms = userSharedFormsSnapshot.val();
                    const sharedKey = Object.keys(sharedForms).find(key => sharedForms[key].formId === formId);
                    if (sharedKey) {
                        await userSharedFormsRef.child(sharedKey).remove();
                    }
                }
            } else {
                // User neither owns the form nor has editing permissions
                notDeletedForms.push({ formId, reason: "User is not the owner or lacks editing permissions" });
            }
        });

        // Wait for all operations to complete
        await Promise.all(deletionPromises);

        res.status(200).json({
            message: "Deletion process completed",
            deletedForms,
            permissionsRemoved,
            notDeletedForms,
        });
    } catch (error) {
        logger.error("Error deleting forms:", error);
        res.status(500).send("Error deleting forms");
    }
});

app.post('/login', async (req, res) => {
    const { email, password, keepMeSignedIn } = req.body;

    const userRef = admin.database().ref('users').orderByChild('email').equalTo(email).limitToFirst(1);
    await userRef.once('value', snapshot => {
        if (snapshot.exists()) {
            const userData = Object.values(snapshot.val())[0];

            bcrypt.compare(password, userData.password, function (err, result) {
                if (err) {
                    logger.error("Authentication error:", err);
                    return res.status(500).send('Authentication error');
                }
                if (result) {
                    const tokenExpiry = keepMeSignedIn ? process.env.KEEP_ME_SIGNED_IN_EXPIRY : process.env.TOKEN_EXPIRY;
                    const token = jwt.sign({
                        email: userData.email,
                        userId: userData.userId
                    }, process.env.JWT_SECRET, { expiresIn: tokenExpiry });

                    // Return the token to the client
                    res.status(200).json({ message: 'Login successful', token });
                } else {
                    res.status(401).send('Incorrect password');
                }
            });
        } else {
            res.status(404).send('There is no user associated with that email address');
        }
    });
});

app.delete('/deleteUser', authenticateToken, async (req, res) => {
    const { email, password } = req.body;

    // Again, assuming there's a way to find a user by email
    const userRef = admin.database().ref('users').orderByChild('email').equalTo(email).limitToFirst(1);
    await userRef.once('value', snapshot => {
        if (snapshot.exists()) {
            const userKey = Object.keys(snapshot.val())[0];
            const userData = Object.values(snapshot.val())[0];
            bcrypt.compare(password, userData.password, function (err, result) {
                if (err) {
                    logger.error("Authentication error:", err);
                    return res.status(500).send('Authentication error');
                }
                if (result) {
                    // Password matches, proceed with deletion
                    admin.database().ref(`users/${userKey}`).remove()
                        .then(() => res.status(200).send('User deleted successfully'))
                        .catch((deleteError) => {
                            logger.error("Error deleting user:", deleteError);
                            res.status(500).send('Error deleting user');
                        });
                } else {
                    // Password does not match
                    res.status(401).send('Incorrect password');
                }
            });
        } else {
            // User not found
            res.status(404).send('User not found');
        }
    });
});

app.get('/getUser', authenticateToken, (req, res) => {
    const userId = req.user.userId; // Assuming this was included in the JWT

    const userRef = admin.database().ref('users').orderByChild('userId').equalTo(userId).limitToFirst(1);
    userRef.once('value', snapshot => {
        if (snapshot.exists()) {
            const userData = Object.values(snapshot.val())[0];
            // Create a copy of userData without the password
            const {password, ...userWithoutPassword} = userData;
            res.json(userWithoutPassword);
        } else {
            res.status(404).send('User not found');
        }
    }).catch(error => {
        res.status(500).send(`Database read failed: ${error}`);
    });
});

app.get('/form/:formId/editor', async (req, res) => {
    const formId = req.params.formId;
    const formRef = admin.database().ref(`forms/${formId}`);
    logger.info(`Attempting to retrieve form with ID: ${formId}`);

    try {
        // Fetch form data
        const snapshot = await formRef.once("value");

        if (!snapshot.exists()) {
            logger.warn(`Form with ID ${formId} not found`);
            return res.status(404).send("Form not found");
        }

        const formData = snapshot.val();

        // Set default values if properties are missing
        const title = formData.title || "Untitled Form";
        const createdAt = formData.createdAt || "Unknown Date";
        const lastUpdated = formData.lastUpdated || "Unknown Date";
        const sections = formData.sections || [];
        const ownerId = formData.owner;

        // Fetch owner's name
        let ownerName = "Unknown Owner";
        if (ownerId) {
            const ownerSnapshot = await admin.database().ref(`users/${ownerId}/fullName`).once("value");
            ownerName = ownerSnapshot.exists() ? ownerSnapshot.val() : "Unknown Owner";
        }

        // Render the formEditor template with the retrieved data
        res.render("formEditor", {
            title,
            formId,
            createdAt,
            lastUpdated,
            sections:JSON.stringify(sections).replace(/</g, '\\u003c'),
            ownerName
        });
    } catch (error) {
        logger.error("Error loading form:", error);
        res.status(500).send("Error loading form");
    }
});

app.get('/form/:formId/', async (req, res) => {
    const formId = req.params.formId;
    const formRef = admin.database().ref(`forms/${formId}`);
    logger.info(`Attempting to retrieve form with ID: ${formId}`);

    try {
        // Fetch form data
        const snapshot = await formRef.once("value");

        if (!snapshot.exists()) {
            logger.warn(`Form with ID ${formId} not found`);
            return res.status(404).send("Form not found");
        }

        const formData = snapshot.val();

        // Set default values if properties are missing
        const title = formData.title || "Untitled Form";
        const createdAt = formData.createdAt || "Unknown Date";
        const lastUpdated = formData.lastUpdated || "Unknown Date";
        const sections = formData.sections || [];
        const ownerId = formData.owner;

        // Fetch owner's name
        let ownerName = "Unknown Owner";
        if (ownerId) {
            const ownerSnapshot = await admin.database().ref(`users/${ownerId}/fullName`).once("value");
            ownerName = ownerSnapshot.exists() ? ownerSnapshot.val() : "Unknown Owner";
        }

        // Render the formEditor template with the retrieved data
        res.render("formResponder", {
            title,
            formId,
            createdAt,
            lastUpdated,
            sections:JSON.stringify(sections).replace(/</g, '\\u003c'),
            ownerName
        });
    } catch (error) {
        logger.error("Error loading form:", error);
        res.status(500).send("Error loading form");
    }
});

app.put('/updateForm', authenticateToken, async (req, res) => {
    const { formId, title, lastUpdated, sections } = req.body;
    const userId = req.user.userId;

    try {
        const formRef = admin.database().ref(`forms/${formId}`);
        const snapshot = await formRef.once('value');

        if (!snapshot.exists()) {
            return res.status(404).send("Form not found.");
        }

        const formData = snapshot.val();

        if (formData.owner !== userId && !formData.sharedWith[userId]?.includes('edit')) {
            return res.status(403).send("You do not have permission to edit this form.");
        }

        await formRef.update({ title, lastUpdated, sections });
        res.status(200).send({ message: "Form updated successfully." });
    } catch (error) {
        logger.error("Error updating form:", error);
        res.status(500).send("Error updating form.");
    }
});



app.post('/shareFormPermissions', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { formId, targetUserId, permission } = req.body;

    if (!formId || !targetUserId || !['view', 'edit'].includes(permission)) {
        return res.status(400).send("Invalid input. Ensure formId, targetUserId, and a valid permission ('view' or 'edit') are provided.");
    }

    try {
        const formRef = admin.database().ref(`forms/${formId}`);
        const snapshot = await formRef.once('value');

        if (!snapshot.exists()) {
            return res.status(404).send("Form not found.");
        }

        const formData = snapshot.val();

        if (formData.owner !== userId) {
            return res.status(403).send("Only the owner can share the form.");
        }

        await formRef.child("sharedWith").update({
            [targetUserId]: permission
        });

        await admin.database().ref(`users/${targetUserId}/sharedForms`).push({
            formId,
            permission,
            sharedBy: userId,
            sharedAt: new Date().toISOString()
        });

        res.status(200).json({ message: `Form shared with user ${targetUserId} with ${permission} permission.` });
    } catch (error) {
        logger.error("Error sharing form permissions:", error);
        res.status(500).send("Error sharing form permissions.");
    }
});

exports.app = functions.https.onRequest(app);