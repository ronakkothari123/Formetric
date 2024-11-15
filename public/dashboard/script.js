function getToken() {
    return sessionStorage.getItem('token') || localStorage.getItem('token');
}

function removeToken() {
    sessionStorage.removeItem('token');
    localStorage.removeItem('token');
}

async function getUser(){
    const uuid = getToken();

    const response = await fetch(`https://us-central1-proadmit-29198.cloudfunctions.net/app/getUser`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Authorization':`Bearer ${uuid}`
        },
        mode: 'cors'
    }).catch(error => {
        console.log(error)
    });

    if(response.status === 404 || response.status === 403) location.href = "../login";

    return response.json();
}

document.querySelectorAll(".new-form-btn").forEach(button => {
    button.addEventListener("click", async () => {
        const response = await fetch(`https://app-hj7jpswabq-uc.a.run.app/createForm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'DELETE, POST, GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Authorization':`Bearer ${getToken()}`
            },
            mode: 'cors'
        });

        const context = response.status;
        console.log(context);
    })
})