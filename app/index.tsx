import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityRecord,
  DetailRecord,
  FrontRecord,
  LocalityRecord,
  ProjectRecord,
  createCheckedActivity,
  createRegistro,
  getActivities,
  getDetails,
  getFronts,
  getLocalities,
  getProjects,
  uploadEvidence,
} from "../services/dataService";
import { supabase } from "../services/supabaseClient";

interface UserRecord {
  id_registro: number;
  fecha_subida: string;
  url_foto: string | null;
  nombre_actividad: string;
  nombre_localidad: string;
  nombre_detalle: string;
  comentario: string | null;
  ruta_archivo: string | null;
  bucket: string | null;
}

type Step =
  | "auth"
  | "project"
  | "front"
  | "locality"
  | "detail"
  | "activity"
  | "map"
  | "form"
  | "profile";

type GpsLocation = {
  latitude: number;
  longitude: number;
};

type DetailWithActivity = DetailRecord & {
  activityName: string;
};

const LOGO_SRC = "https://i.imgur.com/Ej1MRpv.png";

export default function IndexPage() {
  //Establecer auth como primer "paso" dentro de la pagina
  const [step, setStep] = useState<Step>("auth");
  //Estados para la autenticación de usuario
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  //Estados para los campos de email, contraseña y guardar la información del usuario en sesión
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionUser, setSessionUser] = useState<{ email: string; id: string } | null>(
    null
  );
  //------------------
  const [profileEmail, setProfileEmail] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profileName, setProfileName] = useState("");
  //------------------
  const [profileCreatedAt, setProfileCreatedAt] = useState("");
  const [profileLastSignInAt, setProfileLastSignInAt] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [fronts, setFronts] = useState<FrontRecord[]>([]);
  const [localities, setLocalities] = useState<LocalityRecord[]>([]);
  const [details, setDetails] = useState<DetailRecord[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedFrontId, setSelectedFrontId] = useState<number | null>(null);
  const [selectedLocalityId, setSelectedLocalityId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DetailWithActivity | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);
  const [detailSearch, setDetailSearch] = useState("");

  const [gpsLocation, setGpsLocation] = useState<GpsLocation | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isFetchingGps, setIsFetchingGps] = useState(false);
  const [locationMode, setLocationMode] = useState<"auto" | "manual" | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Referencias para inputs de archivo (uno para nuevo registro, otro para editar)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);
  
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");

  const [userRecords, setUserRecords] = useState<UserRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);

  const [editEvidenceFile, setEditEvidenceFile] = useState<File | null>(null);
  const [editComment, setEditComment] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState("");

  //Funcion para definir las opciones de retorno entre los "pasos"
  const getPreviousStep = (current: Step) => {
    switch (current) {
      case "project":
        return "auth";
      case "front":
        return "project";
      case "locality":
        return "front";
      case "detail":
        return "locality";
      case "activity":
        return "detail";
      case "map":
        return "activity";
      case "form":
        return "map";
      case "profile":
        return "project";
      default:
        return "auth";
    }
  };

  //Validar que los campos de email y contraña no esten vacios y que este en modo signup
  const isFormValid = useMemo(
    () =>
      email.trim().length > 0 &&
      password.trim().length > 0 &&
      (authMode === "signup" ? email.trim().length > 0 : true),
    [authMode, email, password]
  );

  //Mapear actividades para acceso rápido
  const activityMap = useMemo(() => {
    return new Map(activities.map((activity) => [activity.ID_Actividad, activity]));
  }, [activities]);

  //Mapear detalles con nombres de actividades
  const mappedDetails = useMemo(() => {
    return details.map((detail) => ({
      ...detail,
      activityName: activityMap.get(detail.ID_Actividad)?.Nombre_Actividad ?? "Sin actividad",
    }));
  }, [details, activityMap]);

  //Implementar búsqueda de detalles por nombre de detalle o actividad
  const filteredDetails = useMemo(() => {
    const query = detailSearch.trim().toLowerCase();
    if (!query) {
      return mappedDetails;
    }
    return mappedDetails.filter((detail) =>
      `${detail.Nombre_Detalle} ${detail.activityName}`.toLowerCase().includes(query)
    );
  }, [detailSearch, mappedDetails]);

  //Complemento para la busqueda
  const selectedActivities = useMemo(() => {
    //Si no hay detalle seleccionado, retornar arreglo vacío
    if (!selectedDetail) {
      return [] as ActivityRecord[];
    }

    //Buscar la actividad correspondiente al detalle seleccionado
    const activity = activityMap.get(selectedDetail.ID_Actividad);
    return activity ? [activity] : [];
  }, [activityMap, selectedDetail]);

  //Cargamos los datos de proyectos
  const loadProjects = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (error) {
      //En caso de error se notifica al usuario
      window.alert("No se pudieron cargar proyectos.");
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  //Cargar datos de perfil de usuario
  const loadProfile = useCallback(async () => {
    setIsProfileLoading(true);
    setProfileMessage(null);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        window.alert("No pudimos cargar el perfil.");
        return;
      }

      setProfileEmail(data.user.email ?? "");
      setProfileName((data.user.user_metadata?.full_name as string | undefined) ?? "");
      setProfileLastName((data.user.user_metadata?.last_name as string | undefined) ?? "");
      setProfileCreatedAt(data.user.created_at ?? "");
      setProfileLastSignInAt(data.user.last_sign_in_at ?? "");
    } catch (error) {
      window.alert("No pudimos cargar el perfil.");
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  //Cargamos los datos de los frentes teniendo en cuenta el ID del proyecto
  const loadFronts = useCallback(async (projectId: number) => {
    setIsLoadingData(true);
    try {
      const data = await getFronts(projectId);
      setFronts(data);
    } catch (error) {
      window.alert("No se pudieron cargar frentes.");
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  //Cargamos los datos de localidades teniendo en cuenta el ID del frente
  const loadLocalities = useCallback(async (frontId: number) => {
    setIsLoadingData(true);
    try {
      const data = await getLocalities(frontId);
      setLocalities(data);
    } catch (error) {
      window.alert("No se pudieron cargar localidades.");
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  //Cargamos los datos de detalles de actividad teniendo en cuenta el ID de la localidad
  const loadDetails = useCallback(async (localityId: number) => {
    setIsLoadingData(true);
    try {
      const data = await getDetails(localityId);
      setDetails(data);
      const activityIds = Array.from(new Set(data.map((detail) => detail.ID_Actividad)));
      const activitiesData = await getActivities(activityIds);
      setActivities(activitiesData);
    } catch (error) {
      window.alert("No se pudieron cargar sectores.");
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  //verificación de formulario y manejo de autenticación
  const handleSubmit = async () => {
    //Verificamos que el gmail y la contraseña no esten vacios
    if (!isFormValid) {
      window.alert(
        authMode === "signup"
          ? "Completa email y contraseña."
          : "Completa email y contraseña."
      );
      return;
    }

    setIsAuthLoading(true);
    try {
      //En modo signup enviamos a Supabase los datos para crear la cuenta
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {},
        });

        if (error) {
          window.alert(
            error.message
              ? `No se pudo crear la cuenta: ${error.message}`
              : "No se pudo crear la cuenta."
          );
          return;
        }

        if (!data.user) {
          window.alert("Revisa tu correo para confirmar la cuenta.");
          return;
        }

        //guardar la información del usuario en sesión
        setSessionUser({ email: data.user.email ?? "usuario", id: data.user.id });
      } else {
        //En modo login enviamos a Supabase los datos para iniciar sesión
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        //Mensaje de error en caso de credenciales incorrectas
        if (error || !data.user) {
          window.alert("Usuario o contraseña incorrectos.");
          return;
        }

        //guardar la información del usuario en sesión
        setSessionUser({ email: data.user.email ?? "usuario", id: data.user.id });
      }

      await loadProjects();
      await loadProfile();
      //cambiamos al "siguiente paso" que es seleccionar proyecto
      setStep("project");
    } catch (error) {
      window.alert("No se pudo iniciar sesión.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  //Manejo de selección de proyecto, frente, localidad, detalle y actividad
  const handleSelectProject = async (projectId: number) => {
    //Despues de seleccionar un proyecto, se resetean los estados relacionados y se guarda
    //el ID del proyecto seleccionado para ir bajando dentro del "arbol" de selección
    setSelectedProjectId(projectId);
    setSelectedFrontId(null);
    setSelectedLocalityId(null);
    setFronts([]);
    setLocalities([]);
    setDetails([]);
    setActivities([]);
    await loadFronts(projectId);
    //Se avanza al siguiente "paso" que es seleccionar frente
    setStep("front");
  };

  //Manejo de selección de frente
  const handleSelectFront = async (frontId: number) => {
    //Despues de seleccionar un frente, se resetean los estados relacionados y se guarda
    //el ID del frente seleccionado para ir bajando dentro del "arbol" de selección
    setSelectedFrontId(frontId);
    setSelectedLocalityId(null);
    setLocalities([]);
    setDetails([]);
    setActivities([]);
    await loadLocalities(frontId);
    //Se avanza al siguiente "paso" que es seleccionar localidad
    setStep("locality");
  };

  //Manejo de selección de localidad
  const handleSelectLocality = async (localityId: number) => {
    //Despues de seleccionar una localidad, se resetean los estados relacionados y se guarda
    //el ID de la localidad seleccionada para ir bajando dentro del "arbol" de selección
    setSelectedLocalityId(localityId);
    setDetails([]);
    setActivities([]);
    setSelectedDetail(null);
    setSelectedActivity(null);
    setDetailSearch("");
    await loadDetails(localityId);
    //Se avanza al siguiente "paso" que es seleccionar detalle
    setStep("detail");
  };

  //Manejo de apertura de formulario de registro de evidencia
  const handleOpenForm = (detail: DetailWithActivity) => {
    //Al abrir el formulario, se guarda el detalle y actividad seleccionados
    setSelectedDetail(detail);
    setSelectedActivity(activityMap.get(detail.ID_Actividad) ?? null);
    setEvidenceFile(null);
    setEvidencePreview(null);
    //Avanzar al siguiente "paso" que es el formulario
    setStep("form");
  };

  //Manejo de selección de detalle
  const handleSelectDetail = (detail: DetailWithActivity) => {
    //Al seleccionar un detalle, se guarda el detalle y actividad seleccionados
    setSelectedDetail(detail);
    setSelectedActivity(activityMap.get(detail.ID_Actividad) ?? null);
    //Avanzar al siguiente "paso" que es confirmar la actividad seleccionada
    setStep("activity");
  };

  const handleConfirmActivity = () => {
    //Verificar que se haya seleccionado un detalle
    if (!selectedDetail) {
      window.alert("Selecciona un sector.");
      return;
    }

    //Avanzar al siguiente "paso" que es el mapa
    setStep("map");
  };

  //---------------------------------------------------------
  // FUNCIONES PARA EL FORMULARIO DE REGISTRO NUEVO
  //---------------------------------------------------------
  
  //Manejo de captura de foto para NUEVO registro
  const handleCapturePhoto = () => {
    fileInputRef.current?.click();
  };

  //Manejo de cambio de archivo en input file para NUEVO registro
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    //Verificar si se seleccionó un archivo
    const file = event.target.files?.[0] ?? null;
    setEvidenceFile(file);
    if (file) {
      //Crear una URL de vista previa para la imagen seleccionada
      const previewUrl = URL.createObjectURL(file);
      setEvidencePreview(previewUrl);
    } else {
      setEvidencePreview(null);
    }
  };

  //---------------------------------------------------------
  // FUNCIONES PARA EL MODAL DE EDICIÓN
  //---------------------------------------------------------

  //Manejo de captura de foto para EDITAR registro
  const handleEditCapturePhoto = () => {
    editFileInputRef.current?.click();
  };

  //Manejo de selección de imagen para EDITAR registro
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    if (file) {
      setEditEvidenceFile(file);
      setPreviewUrl(URL.createObjectURL(file)); 
    } else {
        setEditEvidenceFile(null);
        setPreviewUrl("");
    }
  };

  //---------------------------------------------------------

  //Manejo de captura de coordenadas GPS
  const handleCaptureGps = () => {
    if (locationMode === "manual") {
      return;
    }

    if (!navigator.geolocation) {
      window.alert("El navegador no soporta geolocalización.");
      return;
    }

    setIsFetchingGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setManualLat("");
        setManualLng("");
        setLocationMode("auto");
        setIsFetchingGps(false);
      },
      () => {
        window.alert("No pudimos obtener coordenadas. Intenta nuevamente.");
        setIsFetchingGps(false);
      }
    );
  };

  //Funcionalidad extendida: manejo de coordenadas manuales
  const handleManualUpdate = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      window.alert("Por favor ingresa coordenadas válidas.");
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      window.alert("Coordenadas fuera de rango planetario.");
      return;
    }

    setGpsLocation({ latitude: lat, longitude: lng });
    setLocationMode("manual");
  };

  //Funcionalidad extendida: reinicio de ubicación y desbloqueo de modos
  const handleClearLocation = () => {
    setGpsLocation(null);
    setManualLat("");
    setManualLng("");
    setLocationMode(null);
  };

  //Construir URL de registro con parámetros opcionales
  const buildRegistroUrl = (publicUrl: string) => {
    if (!note.trim() && !gpsLocation) {
      return publicUrl;
    }

    const url = new URL(publicUrl);

    if (note.trim()) {
      url.searchParams.set("comentario", note.trim());
    }

    if (gpsLocation) {
      url.searchParams.set("lat", gpsLocation.latitude.toString());
      url.searchParams.set("lng", gpsLocation.longitude.toString());
    }

    return url.toString();
  };

  const sanitizeName = (text: string | null | undefined) => {
    if (!text) return "indefinido";

    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/:/g, "")
      .replace(/\//g, "-")
      .replace(/\+/g, "_")
      .replace(/\s+/g, " ");
  };

  const formatBucketName = (text: string | null | undefined) => {
    if (!text) return "sin_nombre";
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[:/\\?%#]/g, "");
  };

  const getStorageInfo = () => {
    const projectObj = projects.find((project) => project.ID_Proyectos === selectedProjectId);
    const frontObj = fronts.find((front) => front.ID_Frente === selectedFrontId);
    const localityObj = localities.find((locality) => locality.ID_Localidad === selectedLocalityId);

    const rawProyecto = projectObj?.Proyecto_Nombre;
    const rawFrente = frontObj?.Nombre_Frente;
    const rawLocalidad = localityObj?.Nombre_Localidad;
    const rawSector = selectedDetail?.Nombre_Detalle;
    const rawActividad = selectedActivity?.Nombre_Actividad;

    return {
      bucket: rawProyecto,
      path: `${sanitizeName(rawFrente)}/${sanitizeName(rawLocalidad)}/${sanitizeName(
        rawSector
      )}/${sanitizeName(rawActividad)}`,
    };
  };

  //Manejo de guardado de evidencia
  const handleSave = async () => {
    //Verificar que se haya seleccionado un detalle y que el usuario esté en sesión
    if (!selectedDetail || !sessionUser) {
      window.alert("Selecciona una actividad.");
      return;
    }

    //Verificar que se haya seleccionado un archivo de evidencia
    if (!evidenceFile) {
      window.alert("Selecciona una foto.");
      return;
    }

    try {
      setIsLoadingData(true);
      const latitudFinal = gpsLocation ? gpsLocation.latitude : selectedDetail.Latitud;
      const longitudFinal = gpsLocation ? gpsLocation.longitude : selectedDetail.Longitud;
      const fileName = `evidencia-${Date.now()}.jpg`;
      const storageInfo = getStorageInfo();
      const bucketName = formatBucketName(storageInfo.bucket);
      //Subir el archivo de evidencia al almacenamiento con ruta ordenada
      const filePath = `${storageInfo.path}/${fileName}`;
      const publicUrl = await uploadEvidence(
        bucketName,
        filePath,
        evidenceFile,
        evidenceFile.type || "image/jpeg"
      );
      //Construir la URL del registro con los parámetros opcionales
      const registroUrl = buildRegistroUrl(publicUrl);

      const nuevaActividad = await createCheckedActivity({
        ID_DetallesActividad: selectedDetail.ID_DetallesActividad,
        Latitud: latitudFinal,
        Longitud: longitudFinal,
      });

      const idVerificadaGenerado = nuevaActividad.ID_Verificada;

      await createRegistro({
        Nombre_Archivo: fileName,
        URL_Archivo: registroUrl,
        user_id: sessionUser.id,
        ID_Verificada: idVerificadaGenerado,
        Comentario: note.trim() || null,
        Ruta_Archivo: filePath,
        Bucket: bucketName,
      });

      window.alert("Evidencia guardada.");
      //Después de guardar, regresar al mapa para seguir registrando
      setStep("map");
    } catch (error) {
      window.alert("No se pudo guardar la evidencia.");
    } finally {
      setIsLoadingData(false);
    }
  };

  //Manejo de cierre de sesión y reseteo de estados
  const handleReset = async () => {
    setStep("auth");
    setAuthMode("login");
    setEmail("");
    setPassword("");
    setSessionUser(null);
    setProjects([]);
    setFronts([]);
    setLocalities([]);
    setDetails([]);
    setActivities([]);
    setSelectedProjectId(null);
    setSelectedFrontId(null);
    setSelectedLocalityId(null);
    setSelectedDetail(null);
    setSelectedActivity(null);
    setGpsLocation(null);
    setManualLat("");
    setManualLng("");
    setLocationMode(null);
    setEvidenceFile(null);
    setEvidencePreview(null);
    setNote("");
    setProfileEmail("");
    setProfileLastName("");
    setProfileName("");
    setProfileCreatedAt("");
    setProfileLastSignInAt("");
    setProfileMessage(null);
    await supabase.auth.signOut();
  };
  
  //Manejo de guardado de actualizacion perfil de usuario
  const handleProfileSave = async () => {
    if (!sessionUser) return;
    setIsProfileSaving(true);
    setProfileMessage(null);

    try {
      const { error: dbError } = await supabase
        .from('Detalle_Perfil')
        .update({
          Nombre: profileName.trim(),
          Apellido: profileLastName.trim(),
        })
        .eq('id', sessionUser.id); 

      if (dbError) throw dbError;

      if (profileEmail.trim() !== sessionUser.email) {
        const { error: authError } = await supabase.auth.updateUser({
          email: profileEmail.trim(),
        });
        if (authError) throw authError;
      }

      setProfileMessage("Perfil actualizado correctamente.");
      

      if (loadProfile) await loadProfile(); 

    } catch (error) {
      console.error(error);
      setProfileMessage("No se pudo actualizar el perfil.");
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    //Manejo de eliminación de cuenta de usuario
    const confirmed = window.confirm(
      "¿Seguro que deseas eliminar tu cuenta? Esta acción no se puede deshacer."
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingAccount(true);
    setProfileMessage(null);
    try {
      const { error } = await supabase.rpc("delete_user");
      if (error) {
        setProfileMessage(error.message || "No se pudo eliminar la cuenta.");
        return;
      }

      await handleReset();
    } catch (error) {
      setProfileMessage("No se pudo eliminar la cuenta.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const loadUserRecords = async () => {
    if (!sessionUser) return;
    
    setIsLoadingRecords(true);
    try {
      const { data, error } = await supabase
        .rpc('obtener_historial_usuario', { 
          usuario_uid: sessionUser.id 
        });

      if (error) throw error;

      setUserRecords(data || []);
      
      if (data && data.length > 0) {
        setSelectedRecordId(data[0].id_registro);
      }
    } catch (error) {
      console.error("Error cargando historial:", error);
    } finally {
      setIsLoadingRecords(false);
    }
  };

  const resetEditModalState = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl("");
    setEditEvidenceFile(null);
    setEditComment("");
  }

  const openPhotoModal = () => {
    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
    }
    const recordToEdit = userRecords.find(record => record.id_registro === selectedRecordId);
    setEditComment(recordToEdit?.comentario ?? "");
    setEditEvidenceFile(null);
    setPreviewUrl("");
    setIsPhotoModalOpen(true);
  }
  const closePhotoModal = () => {
    resetEditModalState();
    setIsPhotoModalOpen(false);
  }

  const handleDelete = async (item: UserRecord) => {
    const confirmacion = window.confirm("¿Estás seguro de eliminar esta evidencia permanentemente?");
    if (!confirmacion) return;

    try {
      setIsLoadingData(true);

      if (item.bucket && item.ruta_archivo) {
        const { error: storageError } = await supabase
          .storage
          .from(item.bucket)
          .remove([item.ruta_archivo]);

        if (storageError) {
          throw new Error(`Error borrando imagen: ${storageError.message}`);
        }
      }

      const { error: dbError } = await supabase
        .rpc('eliminar_evidencia_completa', {
          p_id_registro: item.id_registro
        });

      if (dbError) {
        throw new Error(`Error borrando datos: ${dbError.message}`);
      }

      window.alert("Evidencia eliminada correctamente.");
      // Actualizar lista tras eliminar
      await loadUserRecords();
      
    } catch (error: any) {
      console.error(error);
      window.alert(error.message || "Ocurrió un error al eliminar.");
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleUpdate = async (item: UserRecord) => {
    if (!editEvidenceFile && editComment === item.comentario) {
      window.alert("No has realizado cambios.");
      return;
    }

    try {
      setIsLoadingData(true);
      
      let finalRuta = item.ruta_archivo;
      let finalUrl = item.url_foto;
      let finalNombre = null;

      if (editEvidenceFile) {
        const lastSlashIndex = item.ruta_archivo ? item.ruta_archivo.lastIndexOf('/') : -1;
        const folderPath = lastSlashIndex !== -1 
                           ? item.ruta_archivo!.substring(0, lastSlashIndex) 
                           : '';

        const fileName = `evidencia-${Date.now()}.jpg`;
        const newFilePath = folderPath ? `${folderPath}/${fileName}` : fileName;

        const { error: uploadError } = await supabase
          .storage
          .from(item.bucket!)
          .upload(newFilePath, editEvidenceFile, { upsert: false });

        if (uploadError) throw new Error(`Error subiendo foto: ${uploadError.message}`);

        const { data: publicUrlData } = supabase
          .storage
          .from(item.bucket!)
          .getPublicUrl(newFilePath);
        
        finalRuta = newFilePath;
        finalUrl = publicUrlData.publicUrl;
        finalNombre = fileName;
      }

      const updatePayload: any = {
        Comentario: editComment, 
      };

      if (editEvidenceFile) {
        updatePayload.URL_Archivo = finalUrl;
        updatePayload.Ruta_Archivo = finalRuta;
        updatePayload.Nombre_Archivo = finalNombre; 
      }

      const { error: dbError } = await supabase
        .from('Registros')
        .update(updatePayload)
        .eq('ID_Registros', item.id_registro);

      if (dbError) throw new Error(`Error actualizando BD: ${dbError.message}`);

      if (editEvidenceFile && item.ruta_archivo) {
        const oldPathClean = item.ruta_archivo.startsWith('/') 
                             ? item.ruta_archivo.slice(1) 
                             : item.ruta_archivo;

        await supabase.storage.from(item.bucket!).remove([oldPathClean]);
      }

      window.alert("Registro actualizado correctamente.");
      
      resetEditModalState();
      setIsPhotoModalOpen(false);
      // Actualizar lista tras editar
      await loadUserRecords();

    } catch (error: any) {
      console.error(error);
      window.alert("Error al actualizar: " + error.message);
    } finally {
      setIsLoadingData(false);
    }
  };

  //Generar URL de mapa embebido basado en la ubicación del detalle seleccionado
  const mapCoords = useMemo(() => {
    if (gpsLocation) {
      return {
        lat: gpsLocation.latitude,
        lng: gpsLocation.longitude,
      };
    }

    const mapDetail = selectedDetail ?? mappedDetails[0];
    if (!mapDetail) {
      return null;
    }

    return {
      lat: mapDetail.Latitud,
      lng: mapDetail.Longitud,
    };
  }, [gpsLocation, mappedDetails, selectedDetail]);

  const mapEmbedUrl = useMemo(() => {
    if (!mapCoords) {
      return null;
    }

    const bbox = `${mapCoords.lng - 0.01}%2C${mapCoords.lat - 0.01}%2C${
      mapCoords.lng + 0.01
    }%2C${mapCoords.lat + 0.01}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${mapCoords.lat}%2C${mapCoords.lng}`;
  }, [mapCoords]);

  useEffect(() => {
    if (step === "profile" && sessionUser) {
      loadProfile();      // Tu función existente
      loadUserRecords();  // La nueva función
    }
  }, [step, sessionUser]);

  const recordToUpdate = userRecords.find(record => record.id_registro === selectedRecordId);
  const hasChanges = !!recordToUpdate && (editEvidenceFile !== null || editComment.trim() !== (recordToUpdate.comentario ?? ""));

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Reporte de obras</h1>
        {step !== "auth" && sessionUser?.email && (
          <p style={styles.userEmail}>Sesión: {sessionUser.email}</p>
        )}
        {step !== "auth" && (
          <div style={styles.breadcrumbs}>
            <span style={selectedProjectId ? styles.breadcrumbActive : styles.breadcrumbMuted}>
              {selectedProjectId
                ? projects.find((project) => project.ID_Proyectos === selectedProjectId)
                    ?.Proyecto_Nombre ?? "Proyecto"
                : "Proyecto"}
            </span>
            <span style={styles.breadcrumbSeparator}>›</span>
            <span style={selectedFrontId ? styles.breadcrumbActive : styles.breadcrumbMuted}>
              {selectedFrontId
                ? fronts.find((front) => front.ID_Frente === selectedFrontId)?.Nombre_Frente ??
                  "Frente"
                : "Frente"}
            </span>
            <span style={styles.breadcrumbSeparator}>›</span>
            <span style={selectedLocalityId ? styles.breadcrumbActive : styles.breadcrumbMuted}>
              {selectedLocalityId
                ? localities.find((locality) => locality.ID_Localidad === selectedLocalityId)
                    ?.Nombre_Localidad ?? "Localidad"
                : "Localidad"}
            </span>
            <span style={styles.breadcrumbSeparator}>›</span>
            <span style={selectedDetail ? styles.breadcrumbActive : styles.breadcrumbMuted}>
              {selectedDetail?.Nombre_Detalle ?? "Sector"}
            </span>
            <span style={styles.breadcrumbSeparator}>›</span>
            <span style={selectedActivity ? styles.breadcrumbActive : styles.breadcrumbMuted}>
              {selectedActivity?.Nombre_Actividad ?? "Actividad"}
            </span>
          </div>
        )}
        {step !== "auth" && (
          <div style={styles.headerActions}>
            <button onClick={() => setStep(getPreviousStep(step))} style={styles.headerButton}>
              Atrás
            </button>
            <button onClick={handleReset} style={styles.headerButtonOutline}>
              Cerrar sesión
            </button>
          </div>
        )}
        <div style={styles.stepRow}>
          {(
            ["auth", "project", "front", "locality", "detail", "activity", "map", "form", "profile"] as Step[]
          ).map((value) => (
            <span
              key={value}
              style={{
                ...styles.stepDot,
                ...(step === value ? styles.stepDotActive : undefined),
              }}
            />
          ))}
        </div>
      </div>

      {step === "auth" && (
        <div style={styles.card}>
          <div style={styles.logoRow}>
            <img src={LOGO_SRC} alt="Consorcio Cenepa Asociados" style={styles.logo} />
            <span style={styles.logoText}>Consorcio Cenepa Asociados</span>
          </div>
          <h2 style={styles.sectionTitle}>
            {authMode === "login" ? "Inicia sesión" : "Crear cuenta"}
          </h2>
          <label style={styles.label}>Email</label>
          <input
            placeholder="tu@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={styles.input}
          />

          <label style={styles.label}>Contraseña</label>
          <input
            placeholder="Ingresa tu contraseña"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={styles.input}
          />

          <button
            onClick={handleSubmit}
            style={{
              ...styles.primaryButton,
              ...(isFormValid ? undefined : styles.primaryButtonDisabled),
            }}
            disabled={!isFormValid}
          >
            {isAuthLoading
              ? authMode === "login"
                ? "Ingresando…"
                : "Creando…"
              : authMode === "login"
              ? "Ingresar"
              : "Crear cuenta"}
          </button>

          <button
            onClick={() => setAuthMode((mode) => (mode === "login" ? "signup" : "login"))}
            style={styles.secondaryButton}
          >
            {authMode === "login" ? "Crear cuenta" : "Ya tengo cuenta"}
          </button>
        </div>
      )}

      {step === "project" && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Selecciona un proyecto</h2>
          <p style={styles.sectionHint}>
            {isLoadingData ? "Cargando proyectos..." : "Escoge un proyecto para continuar."}
          </p>

          <div style={styles.optionGrid}>
            {projects.map((project) => (
              <button
                key={project.ID_Proyectos}
                onClick={() => handleSelectProject(project.ID_Proyectos)}
                style={styles.optionButton}
              >
                {project.Proyecto_Nombre}
              </button>
            ))}
          </div>

          <button onClick={handleReset} style={styles.secondaryButton}>
            Cerrar sesión
          </button>
          <button onClick={() => setStep("profile")} style={styles.secondaryButton}>
            Mi perfil
          </button>
        </div>
      )}

      {step === "profile" && (
        <>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Perfil de usuario</h2>
          <p style={styles.sectionHint}>
            {isProfileLoading ? "Cargando perfil..." : "Actualiza tus datos personales."}
          </p>

          <label style={styles.label}>Nombre completo</label>
          <input
            placeholder="Nombre"
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            style={styles.input}
          />

          <label style={styles.label}>Apellido</label>
          <input
            placeholder="Apellido"
            value={profileLastName}
            onChange={(event) => setProfileLastName(event.target.value)}
            style={styles.input}
          />

          <label style={styles.label}>Email</label>
          <input
            placeholder="tu@email.com"
            value={profileEmail}
            onChange={(event) => setProfileEmail(event.target.value)}
            style={styles.input}
          />

          <div style={styles.readOnlyBlock}>
            <div>
              <span style={styles.readOnlyLabel}>Creado</span>
              <span style={styles.readOnlyValue}>
                {profileCreatedAt ? new Date(profileCreatedAt).toLocaleString() : "—"}
              </span>
            </div>
            <div>
              <span style={styles.readOnlyLabel}>Último ingreso</span>
              <span style={styles.readOnlyValue}>
                {profileLastSignInAt ? new Date(profileLastSignInAt).toLocaleString() : "—"}
              </span>
            </div>
          </div>

          {profileMessage && <div style={styles.profileMessage}>{profileMessage}</div>}

          <button
            onClick={handleProfileSave}
            style={{
              ...styles.primaryButton,
              ...(isProfileSaving ? styles.primaryButtonDisabled : undefined),
            }}
            disabled={isProfileSaving}
          >
            {isProfileSaving ? "Guardando..." : "Guardar cambios"}
          </button>

          <button
            onClick={handleDeleteAccount}
            style={styles.dangerButton}
            disabled={isDeletingAccount}
          >
            {isDeletingAccount ? "Eliminando..." : "Eliminar cuenta"}
          </button>

          <button onClick={() => setStep("project")} style={styles.secondaryButton}>
            Volver
          </button>

          <div style={styles.historySection}>
            <h3 style={styles.sectionTitle}>Historial de Registros</h3>
            <p style={styles.sectionHint}>Selecciona un registro para ver la evidencia y detalles.</p>

            <div style={styles.historyContainer}>
  
              <div style={styles.historyList}>
                {isLoadingRecords ? (
                  <div style={styles.emptyState}>Cargando registros...</div>
                ) : userRecords.length === 0 ? (
                  <div style={styles.emptyState}>No hay registros aún.</div>
                ) : (
                  userRecords.map((rec) => {
                    const isActive = selectedRecordId === rec.id_registro;
                    return (
                      <div 
                        key={rec.id_registro}
                        onClick={() => setSelectedRecordId(rec.id_registro)}
                        style={{
                          ...styles.historyItem,
                          ...(isActive ? styles.historyItemActive : {}),
                        }}
                      >
                        <div style={styles.searchOptionTitle}>
                          {new Date(rec.fecha_subida).toLocaleDateString()}
                        </div>
                        <div style={styles.searchOptionMeta}>
                          {rec.nombre_actividad.length > 25 
                          ? rec.nombre_actividad.substring(0, 25) + "..." 
                          : rec.nombre_actividad}
                        </div>
                        {isActive && (
                          <div style={{ ...styles.sectionHint, fontSize: '11px', marginTop: '4px', color: '#0B5FFF' }}>
                            Viendo detalles
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div style={styles.historyDetail}>
                {(() => {
                  const selectedRec = userRecords.find(r => r.id_registro === selectedRecordId);

                  if (!selectedRec) {
                    return (
                      <div style={{ ...styles.emptyState, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        Selecciona un registro de la izquierda.
                      </div>
                    );
                  }

                  return (
                    <>
                    <h4 style={{ ...styles.title, fontSize: "18px", marginBottom: "0" }}>
                      Información del Registro
                    </h4>

                    <div style={styles.detailInfoBox}>
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Actividad:</span>
                        <span style={styles.detailValue} title={selectedRec.nombre_actividad}>
                            {selectedRec.nombre_actividad}
                        </span>
                      </div>

                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Localidad:</span>
                        <span style={styles.detailValue}>{selectedRec.nombre_localidad}</span>
                      </div>

                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Detalle:</span>
                        <span style={styles.detailValue}>{selectedRec.nombre_detalle}</span>
                      </div>

                      <div style={{ ...styles.detailRow, borderBottom: 'none' }}>
                        <span style={styles.detailLabel}>Observación:</span>
                        <span style={{ ...styles.detailValue, color: '#0B5FFF', fontStyle: selectedRec.comentario ? 'normal' : 'italic' }}>
                          {selectedRec.comentario || "—"}
                        </span>
                      </div>
                    </div>

                    <div>
                        <label style={{ ...styles.label, fontSize: '12px' }}>Evidencia guardada</label>
                        <div style={{ ...styles.evidenceBox, height: 'auto', minHeight: '200px', backgroundColor: '#F1F5F9' }}>
                          {selectedRec.url_foto ? (
                            <img src={selectedRec.url_foto} alt="Actual" style={{ ...styles.evidenceImage, height: 'auto', maxHeight: '250px' }} />
                          ) : <span style={styles.emptyText}>Sin imagen</span>}
                        </div>
                    </div>

                    <div style={styles.buttonsRow}>
                      <button 
                        style={{ ...styles.dangerButton, marginTop: 0, width: 'auto', flex: 1 }}
                        onClick={() => handleDelete(selectedRec)}
                      >
                        Eliminar
                      </button>

                      <button 
                        style={{ ...styles.secondaryButton, marginTop: 0, width: 'auto', flex: 1 }}
                        onClick={openPhotoModal}
                      >
                        Cambiar Foto
                      </button>
                    </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {isPhotoModalOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalCard}>
              <h3 style={styles.sectionTitle}>Actualizar Evidencia</h3>
              <p style={styles.sectionHint}>Sube una nueva foto para este registro.</p>
              <div style={styles.formBlock}>
                <label style={styles.label}>Nueva Foto / evidencia</label>
                <div style={styles.evidenceBox}>
                  {previewUrl ? (
                    <img src={previewUrl} alt="Nueva Evidencia" style={styles.evidenceImage} />
                    ) : (
                      <span style={styles.emptyText}>Sin foto nueva seleccionada.</span>
                    )
                  } 
                </div>
                  <input 
                    type="text" 
                    value={editComment} 
                    onChange={(e) => setEditComment(e.target.value)}
                    placeholder="Editar comentario..."
                    style={styles.input}
                  />
                  <input 
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    style={{ display: "none" }}
                  />
                <button onClick={handleEditCapturePhoto} style={styles.secondaryButton}>
                    Seleccionar archivo
                </button>
                <div style={styles.fileHelperText}>
                    {editEvidenceFile ? editEvidenceFile.name : "Ningún archivo seleccionado"}
                </div>
              </div>

              <div style={styles.modalButtons}>
                <button 
                  onClick={closePhotoModal}
                  style={{ ...styles.secondaryButton, marginTop: 0, borderColor: 'transparent', color: '#64748B' }}
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    const activeRecord = recordToUpdate;
                    
                    if (activeRecord) {
                        handleUpdate(activeRecord);
                    } else {
                        console.error("Error: No se encontró el registro seleccionado en memoria.");
                        closePhotoModal();
                    }
                  }}
                  style={{ 
                    ...styles.primaryButton, 
                    marginTop: 0,
                    ...(hasChanges ? undefined : styles.primaryButtonDisabled)
                  }}
                  disabled={!hasChanges}
                >
                  Confirmar Cambio
                </button>
              </div>
            </div>
          </div>
        )}
        </>
      )}

      {step === "front" && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Selecciona un frente</h2>
          <p style={styles.sectionHint}>
            {isLoadingData ? "Cargando frentes..." : "Escoge un frente para continuar."}
          </p>

          <div style={styles.optionGrid}>
            {fronts.map((front) => (
              <button
                key={front.ID_Frente}
                onClick={() => handleSelectFront(front.ID_Frente)}
                style={styles.optionButton}
              >
                {front.Nombre_Frente}
              </button>
            ))}
          </div>

          <button onClick={() => setStep("project")} style={styles.secondaryButton}>
            Cambiar proyecto
          </button>
        </div>
      )}

      {step === "locality" && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Selecciona una localidad</h2>
          <p style={styles.sectionHint}>
            {isLoadingData ? "Cargando localidades..." : "Escoge una localidad para continuar."}
          </p>

          <div style={styles.optionGrid}>
            {localities.map((locality) => (
              <button
                key={locality.ID_Localidad}
                onClick={() => handleSelectLocality(locality.ID_Localidad)}
                style={styles.optionButton}
              >
                {locality.Nombre_Localidad}
              </button>
            ))}
          </div>

          <button onClick={() => setStep("front")} style={styles.secondaryButton}>
            Cambiar frente
          </button>
        </div>
      )}

      {step === "detail" && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Selecciona un sector</h2>
          <p style={styles.sectionHint}>
            {isLoadingData ? "Cargando sectores..." : "Elige un sector para ver actividades."}
          </p>

          <div style={styles.searchBlock}>
            <input
              placeholder="Buscar sector o actividad"
              value={detailSearch}
              onChange={(event) => setDetailSearch(event.target.value)}
              style={styles.searchInput}
            />
            <div style={styles.searchResults}>
              {filteredDetails.length === 0 ? (
                <div style={styles.emptyText}>No hay resultados.</div>
              ) : (
                filteredDetails.map((detail) => (
                  <button
                    key={detail.ID_DetallesActividad}
                    onClick={() => handleSelectDetail(detail)}
                    style={styles.searchOption}
                  >
                    <span style={styles.searchOptionTitle}>{detail.Nombre_Detalle}</span>
                    <span style={styles.searchOptionMeta}>{detail.activityName}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <button onClick={() => setStep("locality")} style={styles.secondaryButton}>
            Cambiar localidad
          </button>
        </div>
      )}

      {step === "activity" && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Selecciona la actividad</h2>
          <p style={styles.sectionHint}>
            {selectedDetail
              ? `Sector ${selectedDetail.Nombre_Detalle}`
              : "Selecciona un sector para continuar."}
          </p>

          <div style={styles.optionGrid}>
            {selectedActivities.map((activity) => (
              <button
                key={activity.ID_Actividad}
                onClick={() => setSelectedActivity(activity)}
                style={styles.optionButton}
              >
                {activity.Nombre_Actividad}
              </button>
            ))}
          </div>

          <button onClick={handleConfirmActivity} style={styles.primaryButton}>
            Continuar
          </button>
          <button onClick={() => setStep("detail")} style={styles.secondaryButton}>
            Cambiar sector
          </button>
        </div>
      )}

      {step === "map" && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Sectores y actividades</h2>
          <p style={styles.sectionHint}>
            {isLoadingData
              ? "Cargando sectores..."
              : "Selecciona un sector para registrar evidencia."}
          </p>

          <div style={styles.mapPlaceholder}>
            {mapEmbedUrl ? (
              <iframe
                title="Mapa"
                src={mapEmbedUrl}
                key={mapCoords ? `${mapCoords.lat}-${mapCoords.lng}` : "default"}
                style={styles.mapFrame}
              />
            ) : (
              <div style={styles.emptyState}>Selecciona un sector para ver el mapa.</div>
            )}
          </div>

          <div style={styles.locationGrid}>
            <div style={styles.locationCard}>
              <span style={styles.locationTitle}>Automático</span>
              <p style={styles.locationHint}>
                {gpsLocation
                  ? `${gpsLocation.latitude.toFixed(4)}, ${gpsLocation.longitude.toFixed(4)}`
                  : "Sin coordenadas aún."}
              </p>
              <button
                onClick={handleCaptureGps}
                style={styles.secondaryButton}
                disabled={isFetchingGps || locationMode === "manual"}
              >
                {isFetchingGps ? "Buscando..." : "Usar ubicación"}
              </button>
            </div>

            <div style={styles.locationCard}>
              <span style={styles.locationTitle}>Manual</span>
              <input
                type="number"
                placeholder="Latitud (ej: -18.50)"
                value={manualLat}
                onChange={(event) => setManualLat(event.target.value)}
                style={styles.input}
                disabled={locationMode === "auto"}
              />
              <input
                type="number"
                placeholder="Longitud (ej: -70.20)"
                value={manualLng}
                onChange={(event) => setManualLng(event.target.value)}
                style={styles.input}
                disabled={locationMode === "auto"}
              />
              <button
                onClick={handleManualUpdate}
                style={styles.secondaryButton}
                disabled={!manualLat || !manualLng}
              >
                Actualizar ubicación manual
              </button>
            </div>
          </div>

          <button onClick={handleClearLocation} style={styles.ghostButton}>
            Limpiar ubicación
          </button>

          {selectedDetail && (
            <button onClick={() => handleOpenForm(selectedDetail)} style={styles.pinCard}>
              <div style={styles.pinHeader}>
                <span style={styles.pinTitle}>
                  {selectedActivity?.Nombre_Actividad ?? selectedDetail.activityName}
                </span>
                <span style={styles.statusPill}>pendiente</span>
              </div>
              <div style={styles.pinMeta}>
                {selectedDetail.Nombre_Detalle} · {selectedDetail.Latitud.toFixed(4)},{" "}
                {selectedDetail.Longitud.toFixed(4)}
              </div>
              <div style={styles.pinAction}>Registrar evidencia</div>
            </button>
          )}

          <button onClick={() => setStep("activity")} style={styles.secondaryButton}>
            Cambiar actividad
          </button>
        </div>
      )}

      {step === "form" && selectedDetail && (
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Registro en campo</h2>
          <p style={styles.sectionHint}>Revisa la información antes de guardar.</p>

          <div style={styles.detailInfoBox}>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Proyecto:</span>
              <span style={styles.detailValue}>
                {selectedProjectId
                  ? projects.find((p) => p.ID_Proyectos === selectedProjectId)?.Proyecto_Nombre
                  : "—"}
              </span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Frente:</span>
              <span style={styles.detailValue}>
                {selectedFrontId
                  ? fronts.find((f) => f.ID_Frente === selectedFrontId)?.Nombre_Frente
                  : "—"}
              </span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Localidad:</span>
              <span style={styles.detailValue}>
                {selectedLocalityId
                  ? localities.find((l) => l.ID_Localidad === selectedLocalityId)?.Nombre_Localidad
                  : "—"}
              </span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Sector:</span>
              <span style={styles.detailValue}>{selectedDetail.Nombre_Detalle}</span>
            </div>
            <div style={{ ...styles.detailRow, borderBottom: "none" }}>
              <span style={styles.detailLabel}>Actividad:</span>
              <span style={styles.detailValue}>
                {selectedActivity?.Nombre_Actividad ?? selectedDetail.activityName}
              </span>
            </div>
          </div>

          <div style={{ ...styles.formBlock, marginTop: "16px" }}>
            <label style={{ ...styles.label, fontSize: "12px" }}>Evidencia (Foto)</label>
            <div style={{ ...styles.evidenceBox, backgroundColor: "#F1F5F9" }}>
              {evidencePreview ? (
                <img src={evidencePreview} alt="Evidencia" style={styles.evidenceImage} />
              ) : (
                <span style={styles.emptyText}>Sin foto aún.</span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <button onClick={handleCapturePhoto} style={styles.secondaryButton}>
              Seleccionar foto
            </button>
          </div>

          <div style={styles.formBlock}>
            <label style={styles.label}>Comentario</label>
            <textarea
              placeholder="Escribe un detalle adicional"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              style={styles.textArea}
            />
          </div>

          <button onClick={handleSave} style={styles.primaryButton}>
            {isLoadingData ? "Guardando..." : "Guardar evidencia"}
          </button>

          <button onClick={() => setStep("map")} style={styles.secondaryButton}>
            Volver
          </button>
          <button onClick={handleReset} style={styles.secondaryButton}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
  
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#F5F7FB",
    fontFamily: "system-ui, -apple-system, sans-serif",
    paddingBottom: "32px",
    overflowY: "auto",
  },
  header: {
    padding: "24px",
  },
  headerActions: {
    display: "flex",
    gap: "8px",
    marginTop: "12px",
  },
  headerButton: {
    border: "none",
    backgroundColor: "#0B5FFF",
    color: "#FFFFFF",
    padding: "8px 14px",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  headerButtonOutline: {
    border: "1px solid #CBD5F5",
    backgroundColor: "#FFFFFF",
    color: "#0B5FFF",
    padding: "8px 14px",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  logo: {
    maxWidth: "160px",
    width: "100%",
    height: "64px",
    objectFit: "contain",
    display: "block",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
    flexWrap: "wrap",
  },
  logoText: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#0F172A",
    whiteSpace: "nowrap",
  },
  title: {
    fontSize: "26px",
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: "8px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#475569",
    margin: 0,
  },
  profileMessage: {
    marginTop: "8px",
    padding: "10px 12px",
    borderRadius: "10px",
    backgroundColor: "#F1F5F9",
    fontSize: "13px",
    color: "#0F172A",
  },
  breadcrumbs: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    marginTop: "10px",
    fontSize: "12px",
  },
  breadcrumbActive: {
    color: "#0F172A",
    fontWeight: 600,
  },
  breadcrumbMuted: {
    color: "#94A3B8",
  },
  breadcrumbSeparator: {
    color: "#CBD5F5",
    fontSize: "14px",
  },
  userEmail: {
    marginTop: "8px",
    fontSize: "13px",
    color: "#0B5FFF",
    fontWeight: 600,
  },
  stepRow: {
    display: "flex",
    gap: "6px",
    marginTop: "12px",
  },
  stepDot: {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    backgroundColor: "#CBD5F5",
  },
  stepDotActive: {
    backgroundColor: "#0B5FFF",
  },
  card: {
    backgroundColor: "#FFFFFF",
    margin: "0 24px 24px",
    padding: "20px",
    borderRadius: "16px",
    boxShadow: "0 8px 16px rgba(15, 23, 42, 0.08)",
  },
  sectionTitle: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: "6px",
  },
  sectionHint: {
    fontSize: "13px",
    color: "#64748B",
    marginBottom: "16px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#1E293B",
    marginBottom: "8px",
  },
  input: {
    width: "100%",
    border: "1px solid #E2E8F0",
    borderRadius: "12px",
    padding: "12px 14px",
    fontSize: "15px",
    color: "#0F172A",
    marginBottom: "16px",
    backgroundColor: "#F8FAFC",
  },
  textArea: {
    width: "100%",
    minHeight: "90px",
    border: "1px solid #E2E8F0",
    borderRadius: "12px",
    padding: "12px 14px",
    fontSize: "14px",
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#0B5FFF",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "12px",
    padding: "14px",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: "12px",
  },
  primaryButtonDisabled: {
    backgroundColor: "#94A3B8",
    cursor: "not-allowed",
  },
  secondaryButton: {
    width: "100%",
    marginTop: "12px",
    border: "1px solid #CBD5F5",
    borderRadius: "12px",
    padding: "12px",
    backgroundColor: "#FFFFFF",
    color: "#0B5FFF",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryButtonSmall: {
    border: "1px solid #CBD5F5",
    borderRadius: "10px",
    padding: "8px 12px",
    backgroundColor: "#FFFFFF",
    color: "#0B5FFF",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  helper: {
    marginTop: "12px",
    fontSize: "12px",
    color: "#64748B",
    textAlign: "center",
  },
  searchBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginBottom: "16px",
  },
  searchInput: {
    width: "100%",
    border: "1px solid #E2E8F0",
    borderRadius: "12px",
    padding: "12px 14px",
    fontSize: "14px",
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  searchResults: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "260px",
    overflowY: "auto",
    border: "1px solid #E2E8F0",
    borderRadius: "12px",
    padding: "8px",
    backgroundColor: "#FFFFFF",
  },
  searchOption: {
    border: "1px solid #E2E8F0",
    borderRadius: "10px",
    padding: "10px 12px",
    backgroundColor: "#F8FAFC",
    textAlign: "left",
    cursor: "pointer",
  },
  searchOptionTitle: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#0F172A",
  },
  searchOptionMeta: {
    display: "block",
    fontSize: "12px",
    color: "#64748B",
    marginTop: "4px",
  },
  readOnlyBlock: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    marginBottom: "16px",
    padding: "12px",
    borderRadius: "12px",
    backgroundColor: "#F8FAFC",
    border: "1px solid #E2E8F0",
  },
  readOnlyLabel: {
    display: "block",
    fontSize: "12px",
    color: "#64748B",
    marginBottom: "4px",
  },
  readOnlyValue: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#0F172A",
  },
  dangerButton: {
    width: "100%",
    marginTop: "12px",
    border: "1px solid #FCA5A5",
    borderRadius: "12px",
    padding: "12px",
    backgroundColor: "#FEE2E2",
    color: "#991B1B",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  optionGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "16px",
  },
  optionButton: {
    border: "1px solid #E2E8F0",
    borderRadius: "12px",
    padding: "10px 12px",
    backgroundColor: "#F8FAFC",
    fontSize: "13px",
    fontWeight: 600,
    color: "#0F172A",
    cursor: "pointer",
  },
  mapPlaceholder: {
    borderRadius: "14px",
    overflow: "hidden",
    marginBottom: "16px",
    border: "1px solid #E2E8F0",
  },
  mapFrame: {
    width: "100%",
    height: "220px",
    border: "0",
  },
  emptyState: {
    padding: "16px",
    fontSize: "13px",
    color: "#94A3B8",
    textAlign: "center",
  },
  pinCard: {
    width: "100%",
    border: "1px solid #E2E8F0",
    borderRadius: "14px",
    padding: "14px",
    marginBottom: "12px",
    backgroundColor: "#FFFFFF",
    textAlign: "left",
    cursor: "pointer",
  },
  pinHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "6px",
  },
  pinTitle: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#0F172A",
  },
  statusPill: {
    padding: "4px 10px",
    borderRadius: "999px",
    backgroundColor: "#FEF3C7",
    fontSize: "12px",
    fontWeight: 600,
    color: "#0F172A",
    textTransform: "capitalize",
  },
  pinMeta: {
    fontSize: "12px",
    color: "#475569",
  },
  pinAction: {
    marginTop: "6px",
    fontSize: "12px",
    color: "#0B5FFF",
    fontWeight: 600,
  },
  formBlock: {
    marginBottom: "16px",
  },
  evidenceBox: {
    border: "1px solid #E2E8F0",
    borderRadius: "12px",
    padding: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    marginBottom: "10px",
  },
  evidenceImage: {
    width: "100%",
    height: "160px",
    objectFit: "cover",
    borderRadius: "10px",
  },
  gpsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  gpsText: {
    fontSize: "13px",
    color: "#0F172A",
    fontWeight: 600,
  },
  locationGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
    marginBottom: "12px",
  },
  locationCard: {
    border: "1px solid #E2E8F0",
    borderRadius: "12px",
    padding: "14px",
    backgroundColor: "#FFFFFF",
  },
  locationTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#0F172A",
    display: "block",
    marginBottom: "6px",
  },
  locationHint: {
    fontSize: "12px",
    color: "#475569",
    marginBottom: "12px",
  },
  ghostButton: {
    width: "100%",
    marginBottom: "12px",
    border: "1px dashed #CBD5F5",
    borderRadius: "12px",
    padding: "10px",
    backgroundColor: "#FFFFFF",
    color: "#64748B",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  emptyText: {
    fontSize: "12px",
    color: "#94A3B8",
  },
  historyContainer: {
    display: "flex",
    height: "600px",
    border: "1px solid #E2E8F0",
    borderRadius: "14px",
    overflow: "hidden",
    marginTop: "16px",
    backgroundColor: "#FFFFFF",
  },
  historyList: {
    width: "35%",
    borderRight: "1px solid #E2E8F0",
    overflowY: "auto",
    backgroundColor: "#F8FAFC",
  },
  historyDetail: {
    flex: 1,
    padding: "20px",
    overflowY: "auto",
    backgroundColor: "#FFFFFF",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  historyItem: {
    padding: "16px",
    borderBottom: "1px solid #E2E8F0",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  historyItemActive: {
    backgroundColor: "#FFFFFF",
    borderLeft: "4px solid #0B5FFF",
    paddingLeft: "12px",
  },
  historySection: {
    marginTop: "32px",
    borderTop: "1px solid #E2E8F0",
    paddingTop: "24px",
  },
  buttonsRow: {
    display: "flex",
    gap: "10px",
    marginTop: "auto",
    paddingTop: "20px",
    borderTop: "1px solid #F1F5F9",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "20px",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    width: "100%",
    maxWidth: "400px",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  modalButtons: {
    display: "flex",
    gap: "10px",
    marginTop: "20px",
    width: "100%",
  },
  modalInfoBox: {
    backgroundColor: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: "12px",
    padding: "12px",
    marginBottom: "16px",
    fontSize: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px", 
  },
  modalInfoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    borderBottom: "1px dashed #E2E8F0",
    paddingBottom: "4px",
  },
  modalLabelSmall: {
    fontWeight: 700,
    color: "#64748B",
    whiteSpace: "nowrap",
  },
  modalValueSmall: {
    color: "#0F172A",
    textAlign: "right",
    fontWeight: 500,
  },
  detailInfoBox: {
    borderRadius: "12px",
    backgroundColor: "#F8FAFC",
    border: "1px solid #E2E8F0",
    padding: "12px",
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    borderBottom: "1px dashed #E2E8F0",
    paddingBottom: "6px",
    marginBottom: "6px",
    gap: "12px",
  },
  detailLabel: {
    color: "#64748B",
    fontSize: "12px",
    fontWeight: 700,
  },
  detailValue: {
    color: "#0F172A",
    fontSize: "13px",
    fontWeight: 600,
    textAlign: "right",
  },
  fileHelperText: {
    fontSize: "12px",
    color: "#64748B",
    textAlign: "center",
  },
};

function setIsLoading(arg0: boolean) {
  throw new Error("Function not implemented.");
}
