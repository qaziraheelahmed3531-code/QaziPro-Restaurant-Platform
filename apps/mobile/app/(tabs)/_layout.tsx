import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { colors } from "@/ui/theme";
const Icon = ({ value, color }: { value: string; color: ColorValue }) => (
  <Text style={{ fontSize: 20, color }}>{value}</Text>
);
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
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
