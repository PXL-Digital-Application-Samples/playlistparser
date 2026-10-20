<script setup>
import Welcome from './Welcome.vue';
import Dashboard from './Dashboard.vue';

// "/" is the welcome page when logged out and the library dashboard when in.
defineProps({ me: Object, meLoading: Boolean });
</script>

<template>
  <Dashboard v-if="me || meLoading" :me="me" :me-loading="meLoading" />
  <Welcome v-else />
</template>
