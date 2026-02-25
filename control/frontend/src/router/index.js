import { createRouter, createWebHistory } from 'vue-router'
import CollectionView from '../views/CollectionView.vue'
import ChatView from '../views/ChatView.vue'

const routes = [
  { path: '/', name: 'collection', component: CollectionView },
  { path: '/chat', name: 'chat', component: ChatView }
]

export default createRouter({ history: createWebHistory(), routes })
