import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { safeHaptics } from '../services/haptics';

export interface LocationOptionItem {
  id: string;
  label: string;
  subLabel?: string;
}

export interface LocationSelectModalProps {
  visible: boolean;
  title: string;
  icon?: string;
  searchPlaceholder: string;
  items: LocationOptionItem[];
  selectedId: string | null;
  onSelect: (item: LocationOptionItem) => void;
  onClose: () => void;
}

export default function LocationSelectModal({
  visible,
  title,
  icon = 'map-marker',
  searchPlaceholder,
  items,
  selectedId,
  onSelect,
  onClose,
}: LocationSelectModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = useMemo(() => {
    const rawQ = searchQuery.trim().toLowerCase();
    if (!rawQ) return items;
    // Normalize and strip punctuation while preserving all Unicode letters and numbers across all Indian scripts
    const cleanQ = rawQ.replace(/[^\p{L}\p{N}]/gu, '');
    return items.filter((item) => {
      const idClean = item.id.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const labelClean = item.label.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const subClean = item.subLabel ? item.subLabel.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '';
      return (
        idClean.includes(cleanQ) ||
        labelClean.includes(cleanQ) ||
        subClean.includes(cleanQ) ||
        item.id.toLowerCase().includes(rawQ) ||
        item.label.toLowerCase().includes(rawQ) ||
        (item.subLabel ? item.subLabel.toLowerCase().includes(rawQ) : false)
      );
    });
  }, [items, searchQuery]);

  const handleSelectItem = (item: LocationOptionItem) => {
    safeHaptics.impactLight();
    onSelect(item);
    setSearchQuery('');
  };

  const handleClose = () => {
    safeHaptics.impactLight();
    setSearchQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close selection modal"
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.titleWrap}>
            <MaterialCommunityIcons name={icon as any} size={20} color="#15803D" style={styles.titleIcon} />
            <Text style={styles.headerTitle} numberOfLines={1} allowFontScaling={true}>
              {title}
            </Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText} allowFontScaling={true}>
              {filteredItems.length}
            </Text>
          </View>
        </View>

        {/* Search Input Bar */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={22} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor="#94A3B8"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            allowFontScaling={true}
            accessibilityRole="search"
            accessibilityLabel={searchPlaceholder}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearSearchBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear search text"
            >
              <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Scrollable FlatList */}
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          initialNumToRender={20}
          maxToRenderPerBatch={25}
          windowSize={11}
          renderItem={({ item }) => {
            const isSelected = item.id === selectedId;
            return (
              <TouchableOpacity
                style={[styles.itemRow, isSelected && styles.itemRowSelected]}
                onPress={() => handleSelectItem(item)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}${item.subLabel ? `, ${item.subLabel}` : ''}`}
                accessibilityState={{ selected: isSelected }}
              >
                <View style={styles.itemTextWrap}>
                  <Text
                    style={[styles.itemLabel, isSelected && styles.itemLabelSelected]}
                    allowFontScaling={true}
                  >
                    {item.label}
                  </Text>
                  {item.subLabel ? (
                    <Text
                      style={[styles.itemSubLabel, isSelected && styles.itemSubLabelSelected]}
                      allowFontScaling={true}
                    >
                      {item.subLabel}
                    </Text>
                  ) : null}
                </View>
                {isSelected ? (
                  <View style={styles.checkCircle}>
                    <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                  </View>
                ) : (
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="map-marker-question-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle} allowFontScaling={true}>
                No matches found
              </Text>
              <Text style={styles.emptySubtitle} allowFontScaling={true}>
                Try typing the name in English or regional script.
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  titleIcon: {
    marginRight: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    height: '100%',
  },
  clearSearchBtn: {
    padding: 6,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemRowSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderWidth: 1.5,
  },
  itemTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemLabelSelected: {
    color: '#15803D',
  },
  itemSubLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  itemSubLabelSelected: {
    color: '#166534',
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#334155',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
});
