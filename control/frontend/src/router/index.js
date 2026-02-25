import { createRouter, createWebHistory } from 'vue-router'
import CollectionView from '../views/CollectionView.vue'
import FeaturedView from '../views/FeaturedView.vue'
import ChatView from '../views/ChatView.vue'

const routes = [
  { path: '/', name: 'collection', component: CollectionView },
  { path: '/featured', name: 'featured', component: FeaturedView },
  { path: '/chat', name: 'chat', component: ChatView }
]

export default createRouter({ history: createWebHistory(), routes })
