import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'

const routes = [
  { path: '/', name: 'home', component: HomePage }
  // Claude Code 会在此追加新路由
]

export default createRouter({ history: createWebHistory(), routes })
