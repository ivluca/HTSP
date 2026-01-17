document.addEventListener('DOMContentLoaded', () => {
  const tabsContainer = document.querySelector('.tabs');
  const allTabs = document.querySelectorAll('.tab');
  const iframes = document.querySelectorAll('.ai-frame');
  const dropdownBtn = document.getElementById('dropdown-btn');
  const dropdownContent = document.getElementById('dropdown-content');

  // --- Populate Dropdown ---
  allTabs.forEach(tab => {
    const item = document.createElement('a');
    item.textContent = tab.textContent;
    item.classList.add('dropdown-item');
    item.dataset.target = tab.dataset.target;
    dropdownContent.appendChild(item);
  });

  const dropdownItems = document.querySelectorAll('.dropdown-item');

  // --- Function to Switch Tabs ---
  function switchTab(targetId) {
    // Update iframes
    iframes.forEach(iframe => iframe.classList.add('hidden'));
    const targetIframe = document.getElementById(targetId);
    if (targetIframe) {
      targetIframe.classList.remove('hidden');
    }

    // Update active tab style
    allTabs.forEach(t => {
      if (t.dataset.target === targetId) {
        t.classList.add('active');
        // Scroll the active tab into view
        t.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      } else {
        t.classList.remove('active');
      }
    });
    
    // Close dropdown
    dropdownContent.classList.remove('show');
  }

  // --- Event Listeners ---
  // 1. For tabs in the scrollable header
  allTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.target);
    });
  });

  // 2. For dropdown button
  dropdownBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    dropdownContent.classList.toggle('show');
  });

  // 3. For items in the dropdown menu
  dropdownItems.forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.dataset.target);
    });
  });

  // 4. To close dropdown when clicking outside
  window.addEventListener('click', () => {
    if (dropdownContent.classList.contains('show')) {
      dropdownContent.classList.remove('show');
    }
  });
  
  // --- Drag-to-scroll for trackpad-like experience ---
  let isDown = false;
  let startX;
  let scrollLeft;

  tabsContainer.addEventListener('mousedown', (e) => {
    // Prevent starting drag on the dropdown button
    if (e.target.closest('.dropdown')) return;
    isDown = true;
    startX = e.pageX - tabsContainer.offsetLeft;
    scrollLeft = tabsContainer.scrollLeft;
  });
  tabsContainer.addEventListener('mouseleave', () => {
    isDown = false;
  });
  tabsContainer.addEventListener('mouseup', () => {
    isDown = false;
  });
  tabsContainer.addEventListener('mousemove', (e) => {
    if(!isDown) return;
    e.preventDefault();
    const x = e.pageX - tabsContainer.offsetLeft;
    const walk = (x - startX) * 2; // Adjust multiplier for scroll speed
    tabsContainer.scrollLeft = scrollLeft - walk;
  });

  // --- Final Setup ---
  document.getElementById('year').textContent = new Date().getFullYear();
  // Set initial active tab
  allTabs[0].classList.add('active');
  iframes[0].classList.remove('hidden');
});
