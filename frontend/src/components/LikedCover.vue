<script setup>
// Stand-in cover for "Liked Songs", which has no image in the Web API.
defineProps({ size: { type: Number, default: 64 } });
</script>

<template>
  <span class="liked-cover" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <svg :width="size * 0.42" :height="size * 0.42" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.3h2c.7-1.2 2.2-2.3 4.3-2.3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
    </svg>
  </span>
</template>

<style scoped>
.liked-cover {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: 6px;
  color: #fff;
  background: linear-gradient(135deg, #4a1fb8 0%, #7f6bd8 55%, #b9d9d3 100%);
}
</style>
