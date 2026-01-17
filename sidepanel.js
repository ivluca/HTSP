const tabs = document.querySelectorAll('.tab');
const iframes = document.querySelectorAll('.ai-frame');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // Deactivate all tabs and hide all iframes
    tabs.forEach(t => t.classList.remove('active'));
    iframes.forEach(iframe => iframe.classList.add('hidden'));

    // Activate the clicked tab and show the corresponding iframe
    tab.classList.add('active');
    const targetId = tab.dataset.target;
    const targetIframe = document.getElementById(targetId);
    if (targetIframe) {
      targetIframe.classList.remove('hidden');
    }
  });
});

document.getElementById('year').textContent = new Date().getFullYear();
