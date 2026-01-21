export default function ProfilePage() {
  return (
    <div>
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
        Perfil
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Gestiona la configuración y preferencias de tu perfil
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-2xl">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nombre
            </label>
            <input
              type="text"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Tu nombre"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Correo Electrónico
            </label>
            <input
              type="email"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="tu.correo@ejemplo.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Preferencias
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="mr-2"
                />
                <span className="text-gray-700 dark:text-gray-300">Modo oscuro</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="mr-2"
                />
                <span className="text-gray-700 dark:text-gray-300">Notificaciones por correo</span>
              </label>
            </div>
          </div>

          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}

