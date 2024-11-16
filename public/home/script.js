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

        const context = await response.json();

        if(response.status === 200){
            location.href = `../form/${context.formId}/editor`
        }
    })
});

async function loadForms() {
    console.log("bro")

    try {
        const response = await fetch(`https://app-hj7jpswabq-uc.a.run.app/listForms`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'DELETE, POST, GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Authorization': `Bearer ${getToken()}`
            },
            mode: 'cors'
        });

        if (!response.ok) {
            console.error('Failed to fetch forms:', response.status, response.statusText);
            return;
        }

        const forms = await response.json();
        const documentsViewer = document.getElementById('documents-viewer');

        console.log(forms);

        forms.forEach(form => {
            const formId = form.formId;
            const formTitle = form.title || 'Untitled Form';
            const formOwner = form.ownerFullName || 'Unknown';
            const formResponses = form.responses?.length || 0;
            const lastUpdated = new Date(form.lastUpdated || form.createdAt).toLocaleString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            const formElement = document.createElement('a');
            formElement.href = `../form/${formId}/editor`;
            formElement.className = 'document';
            formElement.id = formId;
            formElement.innerHTML = `
                <div>
                    <div class="document-viewer-checkbox"></div>
                </div>
                <div>
                    <div style="background:var(--accent-color);">
                        <img src="../images/icons/forms.png" alt="">
                    </div>
                    <div>
                        <h1>${formTitle}</h1>
                        <p>${formResponses} Response${formResponses !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                <div>
                    <h1>${formOwner}</h1>
                    <p>${form.ownerEmail || 'No email available'}</p>
                </div>
                <div>
                    <p>${lastUpdated}</p>
                </div>
                <div>
                    <img src="../images/icons/dots-vertical.png" alt="">
                </div>
            `;

            documentsViewer.appendChild(formElement);
        });
    } catch (error) {
        console.error('Error loading forms:', error);
    }
}

function initializeCheckboxToggles() {
    const masterCheckbox = document.getElementById('master-viewer-checkbox');
    const checkboxes = document.querySelectorAll('.document-viewer-checkbox:not(#master-viewer-checkbox)');

    // Toggle individual checkboxes
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            checkbox.classList.toggle('active-document-viewer-checkbox');

            // Check if all checkboxes are active to sync the master checkbox
            const allActive = Array.from(checkboxes).every(checkbox =>
                checkbox.classList.contains('active-document-viewer-checkbox')
            );

            if (allActive) {
                masterCheckbox.classList.add('active-document-viewer-checkbox');
            } else {
                masterCheckbox.classList.remove('active-document-viewer-checkbox');
            }
        });
    });

    // Toggle all checkboxes when the master checkbox is clicked
    masterCheckbox.addEventListener('click', () => {
        const isActive = masterCheckbox.classList.contains('active-document-viewer-checkbox');

        // Toggle master checkbox
        masterCheckbox.classList.toggle('active-document-viewer-checkbox');

        // Set all checkboxes to match the state of the master checkbox
        checkboxes.forEach(checkbox => {
            if (isActive) {
                checkbox.classList.remove('active-document-viewer-checkbox');
            } else {
                checkbox.classList.add('active-document-viewer-checkbox');
            }
        });
    });
}

function setupCarouselClickListener() {
    const carouselElements = document.querySelectorAll('.viewer-carousel-element');

    carouselElements.forEach(element => {
        element.addEventListener('click', () => {
            // Remove the active class from all carousel elements
            carouselElements.forEach(el => el.classList.remove('active-carousel-element'));

            // Add the active class to the clicked element
            element.classList.add('active-carousel-element');
        });
    });
}

// Run the function when the page loads
window.addEventListener('DOMContentLoaded', async function(){
    await loadForms()
    setupCarouselClickListener();
    initializeCheckboxToggles();
});
