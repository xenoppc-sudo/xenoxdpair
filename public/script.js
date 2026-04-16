document.addEventListener('DOMContentLoaded', () => {
    const phoneNumberInput = document.getElementById('phoneNumber');
    const generateBtn = document.getElementById('generateBtn');
    const btnText = document.querySelector('.btn-text');
    const spinner = document.querySelector('.spinner');
    
    const generatorSection = document.getElementById('generator-section');
    const pairingCodeArea = document.getElementById('pairingCodeArea');
    const sessionResultArea = document.getElementById('sessionResultArea');
    const errorArea = document.getElementById('errorArea');
    
    const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');
    const sessionIdDisplay = document.getElementById('sessionIdDisplay');
    const statusText = document.getElementById('statusText');
    
    const copyCodeBtn = document.getElementById('copyCodeBtn');
    const copySessionBtn = document.getElementById('copySessionBtn');
    const restartBtn = document.getElementById('restartBtn');

    let pollInterval = null;

    // Make toast element
    const toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);

    function showToast(message) {
        toast.innerText = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Generator Button Click
    generateBtn.addEventListener('click', async () => {
        const phoneNumber = phoneNumberInput.value.trim();
        
        if (!phoneNumber) {
            showError("Please enter your WhatsApp number.");
            return;
        }

        if (phoneNumber.length < 8) {
            showError("Please enter a valid phone number with country code.");
            return;
        }

        // Set Loading state
        setLoading(true);
        errorArea.classList.add('hidden');

        try {
            const response = await fetch('/api/request-pairing', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phoneNumber })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to generate code");
            }

            // Hide input, show code
            document.querySelector('.input-group').classList.add('hidden');
            generateBtn.classList.add('hidden');
            
            pairingCodeDisplay.innerText = data.code;
            pairingCodeArea.classList.remove('hidden');
            
            // Start polling for session status
            startPolling(data.trackingId);

        } catch (err) {
            showError(err.message);
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        if (isLoading) {
            generateBtn.disabled = true;
            btnText.style.opacity = '0';
            spinner.classList.remove('hidden');
        } else {
            generateBtn.disabled = false;
            btnText.style.opacity = '1';
            spinner.classList.add('hidden');
        }
    }

    function showError(message) {
        errorArea.innerText = message;
        errorArea.classList.remove('hidden');
    }

    function startPolling(trackingId) {
        pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/status?trackingId=${trackingId}`);
                const data = await response.json();

                if (!response.ok) {
                    clearInterval(pollInterval);
                    showError("Session tracking lost. Please try again.");
                    return;
                }

                if (data.status === 'success') {
                    clearInterval(pollInterval);
                    showSuccess(data.sessionId);
                } else if (data.status === 'failed') {
                    clearInterval(pollInterval);
                    showError("Connection failed or timed out. Please try again.");
                    statusText.innerText = "Failed!";
                    document.querySelector('.pulse').style.background = 'var(--error)';
                    document.querySelector('.pulse').style.boxShadow = 'none';
                }

            } catch (err) {
                console.error("Polling error", err);
            }
        }, 3000); // Poll every 3 seconds
    }

    function showSuccess(sessionId) {
        pairingCodeArea.classList.add('hidden');
        sessionIdDisplay.value = sessionId;
        sessionResultArea.classList.remove('hidden');
    }

    // Copy Handlers
    copyCodeBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(pairingCodeDisplay.innerText).then(() => {
            showToast("Pairing Code copied to clipboard!");
        });
    });

    copySessionBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(sessionIdDisplay.value).then(() => {
            showToast("Session ID copied! Keep it safe.");
        });
    });

    // Restart Flow
    restartBtn.addEventListener('click', () => {
        phoneNumberInput.value = '';
        sessionResultArea.classList.add('hidden');
        document.querySelector('.input-group').classList.remove('hidden');
        generateBtn.classList.remove('hidden');
        setLoading(false);
    });
});
