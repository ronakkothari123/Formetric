async function createComponent(htmlFilePath, targetElement) {
    try {
        // Fetch the HTML file
        const response = await fetch(htmlFilePath);
        const htmlContent = await response.text();

        // Create a temporary container for the HTML content
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = htmlContent;

        // Resolve relative paths for images, links, scripts, etc.
        resolveRelativePaths(tempContainer, htmlFilePath);
        resolvePseudoElementStyles(tempContainer, htmlFilePath)

        if (!targetElement) {
            throw new Error('Target element not found');
        }

        // Insert the HTML content
        while (tempContainer.firstChild) {
            targetElement.appendChild(tempContainer.firstChild);
        }

        // Execute any script tags found in the HTML
        executeScripts(targetElement);
    } catch (error) {
        console.error('Error loading or inserting HTML:', error);
    }
}

function resolvePseudoElementStyles(container, htmlFilePath) {
    const baseUri = new URL(htmlFilePath, window.location.href);

    container.querySelectorAll('style').forEach(style => {
        let cssText = style.innerHTML;

        // Simple regex to find background-image in pseudo-elements
        // Note: This is a very basic example and might need to be adapted
        const regex = /\.(\w+::(?:before|after))\s*{\s*background-image:\s*url\(['"]?(?!http:\/\/|https:\/\/)(.*?)['"]?\);/g;
        let match;

        while ((match = regex.exec(cssText)) !== null) {
            // Construct absolute URL
            const newUrl = new URL(match[2], baseUri).href;
            // Replace relative URL with absolute URL in CSS text
            cssText = cssText.replace(match[0], match[0].replace(match[2], newUrl));
        }

        // Update style element
        style.innerHTML = cssText;
    });
}

function resolveRelativePaths(container, htmlFilePath) {
    const baseUri = new URL(htmlFilePath, window.location.href);
    const elementsWithSrc = container.querySelectorAll('[src]');
    const elementsWithHref = container.querySelectorAll('[href]');
    const elementsWithDataImage = container.querySelectorAll('[data-image]');
    const elementsWithDataHoverImage = container.querySelectorAll('[data-hover-image]');

    elementsWithSrc.forEach(el => {
        const src = el.getAttribute('src');
        if (src && !src.startsWith('http://') && !src.startsWith('https://')) {
            el.src = new URL(src, baseUri).href;
        }
    });

    elementsWithHref.forEach(el => {
        const href = el.getAttribute('href');
        if (href && !href.startsWith('http://') && !href.startsWith('https://')) {
            el.href = new URL(href, baseUri).href;
        }
    });

    container.querySelectorAll('*').forEach(el => {
        const style = el.getAttribute('style');
        if (style && style.includes('background-image')) {
            const newStyle = style.replace(/background-image: *url\(['"]?(?!http:\/\/|https:\/\/)(.*?)['"]?\)/g, (match, url) => {
                const newUrl = new URL(url, baseUri).href;
                return `background-image: url('${newUrl}')`;
            });
            el.setAttribute('style', newStyle);
        }
    });
}

function executeScripts(container) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => {
            newScript.setAttribute(attr.name, attr.value);
        });
        newScript.textContent = oldScript.textContent;
        document.body.appendChild(newScript);
        oldScript.parentNode.removeChild(oldScript);
    });
}