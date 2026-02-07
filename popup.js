document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById('scanButton');

  if (scanButton) {
    scanButton.addEventListener('click', () => {
      console.log('Scan started by Linzu...');
    });
  }
});
