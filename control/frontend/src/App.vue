<template>
  <div class="app-container">
    <router-view />
    <nav class="bottom-bar">
      <router-link to="/" class="tab" :class="{ active: $route.name === 'collection' }">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        <span>交互集合</span>
      </router-link>
      <router-link to="/chat" class="tab" :class="{ active: $route.name === 'chat' }">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>对话</span>
      </router-link>
    </nav>
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', sans-serif;
  background: #f5f5f5;
  color: #1a1a1a;
  overflow: hidden;
}
.font-mono { font-family: 'JetBrains Mono', monospace; }
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.bottom-bar {
  height: 56px;
  background: white;
  border-top: 2px solid #000;
  display: flex;
  flex-shrink: 0;
}
.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  text-decoration: none;
  color: #aaa;
  font-size: 11px;
  font-weight: 700;
  transition: all 0.15s;
}
.tab:hover { color: #666; background: #fafafa; }
.tab.active { color: #000; background: #f0f0f0; }
</style>
