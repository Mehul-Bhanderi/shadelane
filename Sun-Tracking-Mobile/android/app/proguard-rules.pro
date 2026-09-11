# Keep Capacitor / WebView entry points
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-dontwarn com.getcapacitor.**
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
