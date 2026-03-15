import { createRouter, createWebHistory } from 'vue-router'
import CollectionView from '../views/CollectionView.vue'
import FeaturedView from '../views/FeaturedView.vue'
import ChatView from '../views/ChatView.vue'
import CanvasView from '../views/CanvasView.vue'

const routes = [
  { path: '/', name: 'collection', component: CollectionView },
  { path: '/featured', name: 'featured', component: FeaturedView },
  { path: '/chat', name: 'chat', component: ChatView },
  { path: '/canvas', name: 'canvas', component: CanvasView }
]

export default createRouter({ history: createWebHistory(), routes })
