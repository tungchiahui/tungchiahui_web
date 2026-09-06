### 1.8.4 GNSS案例\(C++\)

#### 1.源文件

功能包cpp05\_gnss的src目录下，新建C++文件gnss2path.cpp，并编辑文件，输入如下内容：

```cpp
// 1.包含头文件；
#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/msg/nav_sat_fix.hpp"
#include "nav_msgs/msg/path.hpp"
#include "geometry_msgs/msg/pose_stamped.hpp"


using namespace std::placeholders;
struct MyPose {
  double longitude; // 纬度
  double latitude; // 经度
  double altitude; // 海拔
};
// 3.自定义节点类；
class Gnss2Path: public rclcpp::Node{
public:
    Gnss2Path():Node("gnss2path_node_cpp"){
        // 初始化
        is_origin = true;
        path.header.frame_id = "gnss_link";
        // 经度与纬度分辨率
        this->declare_parameter("lo_resulation",0.000008983);
        this->declare_parameter("la_resulation",0.000008993);
        lo_resulation = this->get_parameter("lo_resulation").as_double();
        la_resulation = this->get_parameter("la_resulation").as_double();
        gnss_sub_ = this->create_subscription<sensor_msgs::msg::NavSatFix>("gps/fix",10,std::bind(&Gnss2Path::gnss_cb,this,_1));
        path_pub_ = this->create_publisher<nav_msgs::msg::Path>("gnss_path",10);
    }
private:
    rclcpp::Subscription<sensor_msgs::msg::NavSatFix>::SharedPtr gnss_sub_;
    rclcpp::Publisher<nav_msgs::msg::Path>::SharedPtr path_pub_;
    nav_msgs::msg::Path path;
    bool is_origin; // 是否是轨迹中的原点
    MyPose origin; // 原点
    double lo_resulation,la_resulation;

    void gnss_cb(const sensor_msgs::msg::NavSatFix & gnss){
      path.header.stamp = this->now();
      geometry_msgs::msg::PoseStamped ps;
      ps.header.frame_id = "gnss_link";
      ps.header.stamp = this->now();

      // 第一次订阅的坐标点作为path的起点，后续的坐标点以此为参考
      if (is_origin)
      {
        //获取初始经纬度与海拔
        origin.longitude = gnss.longitude;
        origin.latitude = gnss.latitude;
        origin.altitude = gnss.altitude;
        // 设置标记
        is_origin = false;
      } else {
        // 根据经纬度海拔的变换，计算出 x y z 三轴位移并设置进 ps。
        // 获取当前点相对于原点的经纬度与海拔的差值。
        double delta_lo = gnss.longitude - origin.longitude; // 经度改变
        double delta_la = gnss.latitude - origin.latitude; // 纬度改变
        double delta_al = gnss.altitude - origin.altitude; // 海拔改变

        // 根据经度计算x位移
        ps.pose.position.x = delta_lo / lo_resulation;
        // 根据纬度计算y位移
        ps.pose.position.y = delta_la / la_resulation;
        // 直接把海拔差值作为z位移
        ps.pose.position.z = delta_al;

      }
      path.poses.push_back(ps);
      path_pub_->publish(path);

    }
};

int main(int argc, char const *argv[])
{
    // 2.初始化ROS2客户端；
    rclcpp::init(argc,argv);
    // 4.调用spain函数，并传入节点对象指针；
    rclcpp::spin(std::make_shared<Gnss2Path>());
    // 5.资源释放。
    rclcpp::shutdown();
    return 0;
}
```

#### 2.编辑配置文件

##### 1.packages.xml {#1packagesxml}

在创建功能包时，所依赖的功能包已经自动配置了，配置内容如下：

```xml
<depend>rclcpp</depend>
<depend>sensor_msgs</depend>
<depend>nav_msgs</depend>
<depend>geometry_msgs</depend>
```

##### 2.CMakeLists.txt {#2cmakeliststxt}

CMakeLists.txt 中核心配置如下：

```
# find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(nav_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)

add_executable(gnss2path src/gnss2path.cpp)

ament_target_dependencies(
  gnss2path
  "rclcpp"
  "sensor_msgs"
  "nav_msgs"
  "geometry_msgs"
)

install(TARGETS gnss2path
  DESTINATION lib/${PROJECT_NAME})
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select cpp05_gnss
```

#### 4.执行

在当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run cpp05_gnss gnss2path
```

终端下进入bag文件所属的目录，调用如下指令回放bag文件：

```
ros2 bag play gps_bag02
```

其中，`gps_bag02`需要替换为你自己的bag文件。

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，将参考坐标系设置为gnss\_link，添加Path插件并将话题设置为/gnss\_path。接下来就会在rviz2中就会显示机器人的运动轨迹了，其运行结果与演示案例类似。

