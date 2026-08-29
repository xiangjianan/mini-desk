<script setup lang="ts">
import { computed } from "vue";
import { normalizeSearchQuery, splitHighlightSegments } from "../utils/searchHighlight";

const props = defineProps<{ text: string; query: string }>();

const normalized = computed(() => normalizeSearchQuery(props.query));
const segments = computed(() => splitHighlightSegments(props.text, normalized.value));
</script>

<template>
  <span class="highlight-text">
    <template v-for="(segment, index) in segments" :key="index">
      <mark v-if="segment.match">{{ segment.text }}</mark>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>
