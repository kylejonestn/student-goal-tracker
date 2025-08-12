// =======================================================================
// CONFIGURATION
// =======================================================================
// IMPORTANT: Replace this with the API URL you got after deploying your Apps Script.
const API_URL = "https://script.google.com/macros/s/AKfycbxbu8EHFE8l9x8ZFK4efuWHkhMkjC6JN421qYVlwySEBvDpRGBfp9ONlNKJOOEfzPg4hQ/exec"; 

// =======================================================================
// GLOBAL VARIABLES
// =======================================================================
let userProfile = null; // To store user's name, email, etc.

// =======================================================================
// AUTHENTICATION
// =======================================================================

/**
 * This function is called automatically by the Google Sign-In library
 * after a user successfully signs in.
 * @param {Object} response The credential response object from Google.
 */
function handleCredentialResponse(response) {
  // The 'credential' is a secure JWT (JSON Web Token) that proves the user's identity.
  const id_token = response.credential;
  
  // Send this token to our backend API for verification.
  const payload = {
    action: 'verifyToken',
    token: id_token
  };

  fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8', // Required for Apps Script POST
    },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(result => {
    if (result.status === 'SUCCESS') {
      // If the backend successfully verifies the user...
      console.log("User verified:", result.data);
      userProfile = result.data;
      
      // Show the main app and hide the sign-in view.
      document.getElementById('sign-in-view').style.display = 'none';
      document.getElementById('app-container').style.display = 'block';
      
      // Now, load the main application data.
      loadInitialAppData(); 
    } else {
      // If verification fails, show the error.
      console.error("Verification failed:", result.message);
      alert("Sign-in failed. Please try again. Error: " + result.message);
    }
  })
  .catch(err => {
    console.error("Fetch error:", err);
    alert("An error occurred while trying to sign in.");
  });
}

// =======================================================================
// DATA LOADING
// =======================================================================

function loadInitialAppData() {
  // This is where we will eventually call our 'getInitialData' endpoint
  // and populate the main app container with the UI we've built.
  const appContainer = document.getElementById('app-container');
  appContainer.innerHTML = `
    <h2>Welcome, ${userProfile.name}!</h2>
    <p>Your app content will be loaded here.</p>
  `;
}
