# Eliminar los archivos de lock que Chrome crea
rm -rf /root/message-admin/profiles/ieguillermo/SingletonLock
rm -rf /root/message-admin/profiles/ieindependencia/SingletonLock
rm -rf /root/message-admin/profiles/ieguillermo/SingletonSocket
rm -rf /root/message-admin/profiles/ieindependencia/SingletonSocket

# Luego reinicia la app
npm run start:dev


# Eliminar perfiles completamente
rm -rf /root/message-admin/profiles/ieguillermo
rm -rf /root/message-admin/profiles/ieindependencia

# Luego reinicia - se crearán nuevos perfiles limpios
npm run start:dev