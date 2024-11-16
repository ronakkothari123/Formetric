document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const parentContainers = document.querySelectorAll(".parent-container");

    // Remove active class from all parent containers initially
    parentContainers.forEach(container => container.classList.remove("active-container"));

    if (urlParams.has("signup")) {
        // Add active class to the second parent container
        parentContainers[1].classList.add("active-container");
    } else if (urlParams.has("forgotPassword")) {
        // Add active class to the third parent container
        parentContainers[2].classList.add("active-container");
    } else {
        // Add active class to the first parent container by default
        parentContainers[0].classList.add("active-container");
    }
});

document.querySelector("#signup-btn").addEventListener("click", async function(e) {
    e.preventDefault();

    const userObj = {
        fullName: `${document.getElementById("signup-first-name").value} ${document.getElementById("signup-last-name").value}`,
        email: document.getElementById("signup-email").value,
        password: document.getElementById("signup-password").value
    };

    const response = await fetch(`https://app-hj7jpswabq-uc.a.run.app/createUser`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(userObj),
        mode: 'cors'
    });

    const context = response.status;
    console.log(context);

    if (context === 200) {
        location.href = "../login/"
    } else if(context === 400) {
        document.querySelectorAll(".alert-message")[1].innerHTML = "An account with this email already exists, or the email format is incorrect. Please use a different email or correct the format.";
        document.querySelectorAll(".alert-message")[1].style.display = 'block';
    } else {
        document.querySelectorAll(".alert-message")[1].innerHTML = "Something went wrong on our end. Please try again later.";
        document.querySelectorAll(".alert-message")[1].style.display = 'block';
    }
});

document.getElementById("login-btn").addEventListener("click", async function (e) {
    e.preventDefault();

    const userObj = {
        email: document.getElementById("login-email").value,
        password: document.getElementById("login-password").value,
        keepMeSignedIn: /*document.getElementById("login-check").classList.contains("checked")*/ true
    }

    const response = await fetch(`https://app-hj7jpswabq-uc.a.run.app/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'DELETE, POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify(userObj),
        mode: 'cors'
    });

    const context = response.status;
    console.log(context);

    if(context === 200){
        const message = await response.json();

        if(userObj.keepMeSignedIn){
            window.localStorage.setItem('token', message.token);
        } else {
            window.sessionStorage.setItem('token', message.token);
        }

        location.href = "../home/";

    } else if(context === 401 || context === 404) {
        document.querySelectorAll(".alert-message")[0].innerHTML = "Invalid email or password. Please double-check your credentials and try again.";
        document.querySelectorAll(".alert-message")[0].style.display = 'block';
    } else {
        const text = await response.text();
        console.log(text);
    }
});