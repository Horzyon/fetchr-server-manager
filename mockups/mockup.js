// Tab navigation
const sidebarLinks = document.querySelectorAll('.sidebar-link[data-tab]');
const tabs = document.querySelectorAll('.tab');

sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = link.dataset.tab;

        sidebarLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById(`${tabId}-tab`).classList.add('active');
    });
});

// Container slot click → open detail panel
const containerSlots = document.querySelectorAll('.container-slot.active, .docker-card');
const detailPanel = document.getElementById('detail-panel');
const detailClose = document.getElementById('detail-close');

containerSlots.forEach(slot => {
    slot.addEventListener('click', () => {
        detailPanel.classList.add('open');
    });
});

if (detailClose) {
    detailClose.addEventListener('click', () => {
        detailPanel.classList.remove('open');
    });
}

// Close panel on outside click
document.addEventListener('click', (e) => {
    if (detailPanel && detailPanel.classList.contains('open')) {
        if (!detailPanel.contains(e.target) && !e.target.closest('.container-slot') && !e.target.closest('.docker-card')) {
            detailPanel.classList.remove('open');
        }
    }
});

// Toggle buttons
document.querySelectorAll('.toggle-bar').forEach(bar => {
    const opts = bar.querySelectorAll('.toggle-opt');
    opts.forEach(opt => {
        opt.addEventListener('click', () => {
            opts.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
        });
    });
});

// Deploy button press effect
document.querySelectorAll('.deploy-btn, .act-btn, .chip-btn, .save-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.style.transform = 'scale(0.95)';
        setTimeout(() => btn.style.transform = '', 150);
    });
});
