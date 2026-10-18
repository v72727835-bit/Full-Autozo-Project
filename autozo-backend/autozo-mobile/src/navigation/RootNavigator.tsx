import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import RiderHome from '../screens/RiderHome';
import LoginScreen from '../screens/LoginScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import { colors } from '../theme';

export type AuthStackParamList = { Login: undefined; ForgotPassword: undefined };
export type AppStackParamList = { RiderHome: undefined };

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background, primary: colors.primary } };

function Splash() { return <View style={styles.splash}><Text style={styles.brand}>Autozo Rider</Text><ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} /></View>; }

export default function RootNavigator() {
  const { user, initializing } = useAuth();
  if (initializing) return <Splash />;
  return <NavigationContainer theme={navTheme}>
    {user?.role === 'rider' ? <AppStack.Navigator screenOptions={{ headerShown: false }}><AppStack.Screen name="RiderHome" component={RiderHome} /></AppStack.Navigator> : <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}><AuthStack.Screen name="Login" component={LoginScreen} /><AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} /></AuthStack.Navigator>}
  </NavigationContainer>;
}

const styles = StyleSheet.create({ splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, brand: { fontSize: 32, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 } });