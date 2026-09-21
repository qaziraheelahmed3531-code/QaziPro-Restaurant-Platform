import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useApp } from "@/state/AppProvider";
import { colors, themeColors } from "@/ui/theme";
const Icon = ({ value, color }: { value: string; color: ColorValue }) => (
  <Text style={{ fontSize: 20, color }}>{value}</Text>
);
export default function TabsLayout() {
  const palette = themeColors(useApp().bootstrap?.colors);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarStyle: {
          height: 66,
          paddingBottom: 8,
          paddingTop: 6,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Menu",
          tabBarIcon: ({ color }) => <Icon value="🍽" color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color }) => <Icon value="🧾" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) => <Icon value="👤" color={color} />,
        }}
      />
    </Tabs>
  );
}
